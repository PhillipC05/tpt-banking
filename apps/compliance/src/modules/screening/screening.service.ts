import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ScreeningResult,
  ScreeningType,
  ScreeningStatus,
  ScreeningTrigger,
} from '@tpt/database';
import { ComplyAdvantageService } from './comply-advantage.service';

export interface ScreenCustomerParams {
  customerId: string;
  name: string;
  dateOfBirth?: string;
  nationality?: string;
  trigger: ScreeningTrigger;
}

@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);
  // Days between periodic re-screens
  private readonly PERIODIC_SCREEN_DAYS = 90;

  constructor(
    @InjectRepository(ScreeningResult)
    private readonly screeningRepo: Repository<ScreeningResult>,
    private readonly complyAdvantage: ComplyAdvantageService,
  ) {}

  /**
   * Runs all screening types (sanctions + PEP + adverse media) for a customer.
   * Returns a combined risk assessment.
   */
  async screenCustomer(params: ScreenCustomerParams): Promise<{
    clear: boolean;
    hits: number;
    results: ScreeningResult[];
  }> {
    const types = [ScreeningType.SANCTIONS, ScreeningType.PEP, ScreeningType.ADVERSE_MEDIA];
    const results: ScreeningResult[] = [];

    for (const type of types) {
      const result = await this.runScreening({ ...params, type });
      results.push(result);
    }

    // Check for high-risk jurisdiction
    if (params.nationality && this.complyAdvantage.isHighRiskJurisdiction(params.nationality)) {
      const record = this.screeningRepo.create({
        customerId: params.customerId,
        type: ScreeningType.WATCHLIST,
        status: ScreeningStatus.HIT,
        trigger: params.trigger,
        matchCount: 1,
        matches: [{ reason: 'HIGH_RISK_JURISDICTION', country: params.nationality }],
        riskScore: '75',
      });
      results.push(await this.screeningRepo.save(record));
    }

    const hits = results.filter((r) => r.status === ScreeningStatus.HIT).length;
    const nextScreenAt = new Date();
    nextScreenAt.setDate(nextScreenAt.getDate() + this.PERIODIC_SCREEN_DAYS);

    // Update next screen date on all results
    for (const r of results) {
      await this.screeningRepo.update(r.id, { nextScreenAt });
    }

    return { clear: hits === 0, hits, results };
  }

  private async runScreening(params: ScreenCustomerParams & { type: ScreeningType }): Promise<ScreeningResult> {
    const filters = {
      SANCTIONS: { types: ['sanction'] },
      PEP: { types: ['pep'] },
      ADVERSE_MEDIA: { types: ['adverse-media', 'adverse-media-financial-crime'] },
      WATCHLIST: { types: ['warning', 'fitness-probity'] },
    };

    const searchResult = await this.complyAdvantage.search({
      name: params.name,
      dateOfBirth: params.dateOfBirth,
      nationality: params.nationality,
      searchType: 'INDIVIDUAL',
      filters: filters[params.type],
    });

    const status = searchResult.totalHits > 0 ? ScreeningStatus.HIT : ScreeningStatus.CLEAR;

    const record = this.screeningRepo.create({
      customerId: params.customerId,
      type: params.type,
      status,
      trigger: params.trigger,
      providerSearchId: searchResult.searchId,
      riskScore: searchResult.riskScore.toFixed(2),
      matchCount: searchResult.totalHits,
      matches: searchResult.matches as unknown as Record<string, unknown>[],
      providerResponse: searchResult.rawResponse ?? null,
    });

    const saved = await this.screeningRepo.save(record);

    if (status === ScreeningStatus.HIT) {
      this.logger.warn(
        `Screening HIT: customer=${params.customerId} type=${params.type} ` +
        `hits=${searchResult.totalHits} score=${searchResult.riskScore}`,
      );
    }

    return saved;
  }

  async resolveScreening(
    screeningId: string,
    reviewerUserId: string,
    decision: 'CONFIRMED_MATCH' | 'FALSE_POSITIVE',
    notes?: string,
  ): Promise<ScreeningResult> {
    const screening = await this.screeningRepo.findOne({ where: { id: screeningId } });
    if (!screening) throw new NotFoundException(`Screening ${screeningId} not found`);

    await this.screeningRepo.update(screeningId, {
      status: decision === 'CONFIRMED_MATCH'
        ? ScreeningStatus.CONFIRMED_MATCH
        : ScreeningStatus.FALSE_POSITIVE,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      reviewerNotes: notes ?? null,
    });

    return this.screeningRepo.findOneOrFail({ where: { id: screeningId } });
  }

  async findByCustomer(customerId: string): Promise<ScreeningResult[]> {
    return this.screeningRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findPendingReviews(): Promise<ScreeningResult[]> {
    return this.screeningRepo.find({
      where: { status: ScreeningStatus.HIT },
      order: { createdAt: 'ASC' },
    });
  }
}
