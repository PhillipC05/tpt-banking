import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CddAssessment,
  CddRiskRating,
  CddSourceOfFunds,
  CddStatus,
} from '@tpt/database';
import { InitiateCddDto } from './dto/initiate-cdd.dto';

interface RiskFactor {
  factor: string;
  weight: number;
  triggered: boolean;
}

@Injectable()
export class CddService {
  private readonly logger = new Logger(CddService.name);

  constructor(
    @InjectRepository(CddAssessment)
    private readonly cddRepo: Repository<CddAssessment>,
  ) {}

  // ─── Initiate ──────────────────────────────────────────────────────────────

  async initiateAssessment(dto: InitiateCddDto): Promise<CddAssessment> {
    // One pending assessment per customer at a time
    const existing = await this.cddRepo.findOne({
      where: { customerId: dto.customerId, status: CddStatus.PENDING },
    });
    if (existing) return existing;

    const assessment = this.cddRepo.create({
      customerId: dto.customerId,
      sourceOfFunds: dto.sourceOfFunds ?? null,
      sourceOfWealth: dto.sourceOfWealth ?? null,
      businessNature: dto.businessNature ?? null,
      beneficialOwners: dto.beneficialOwners ?? null,
      politicallyExposed: dto.politicallyExposed ?? false,
      adverseMediaHits: dto.adverseMediaHits ?? null,
      notes: dto.notes ?? null,
    });
    return this.cddRepo.save(assessment);
  }

  // ─── Complete assessment with risk scoring ─────────────────────────────────

  async completeAssessment(
    id: string,
    reviewerUserId: string,
    overrides?: Partial<InitiateCddDto>,
  ): Promise<CddAssessment> {
    const assessment = await this.findByIdOrThrow(id);
    if (assessment.status !== CddStatus.PENDING) {
      throw new BadRequestException(`Assessment ${id} is already ${assessment.status}`);
    }

    // Apply any field overrides supplied during review
    if (overrides) {
      Object.assign(assessment, {
        sourceOfFunds:    overrides.sourceOfFunds    ?? assessment.sourceOfFunds,
        sourceOfWealth:   overrides.sourceOfWealth   ?? assessment.sourceOfWealth,
        businessNature:   overrides.businessNature   ?? assessment.businessNature,
        beneficialOwners: overrides.beneficialOwners ?? assessment.beneficialOwners,
        politicallyExposed: overrides.politicallyExposed ?? assessment.politicallyExposed,
        adverseMediaHits: overrides.adverseMediaHits ?? assessment.adverseMediaHits,
        notes:            overrides.notes            ?? assessment.notes,
      });
    }

    const { score, rating, factors } = this.calculateRiskScore(assessment);

    const requiresEdd = rating === CddRiskRating.HIGH || rating === CddRiskRating.VERY_HIGH;
    const nextReviewDate = this.nextReviewDate(rating);

    await this.cddRepo.update(id, {
      riskScore: score,
      riskRating: rating,
      sourceOfFunds:      assessment.sourceOfFunds,
      sourceOfWealth:     assessment.sourceOfWealth,
      businessNature:     assessment.businessNature,
      beneficialOwners:   assessment.beneficialOwners,
      politicallyExposed: assessment.politicallyExposed,
      adverseMediaHits:   assessment.adverseMediaHits,
      notes:              assessment.notes,
      status: requiresEdd ? CddStatus.REQUIRES_EDD : CddStatus.COMPLETED,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      nextReviewDate,
    });

    this.logger.log(
      `CDD ${id} completed — score=${score}, rating=${rating}, factors: ${factors
        .filter((f) => f.triggered)
        .map((f) => f.factor)
        .join(', ')}`,
    );

    return this.findByIdOrThrow(id);
  }

  // ─── Risk scoring (rules-based) ────────────────────────────────────────────

  calculateRiskScore(assessment: Partial<CddAssessment>): {
    score: number;
    rating: CddRiskRating;
    factors: RiskFactor[];
  } {
    const factors: RiskFactor[] = [
      {
        factor: 'Politically exposed person',
        weight: 30,
        triggered: !!assessment.politicallyExposed,
      },
      {
        factor: 'Adverse media hits',
        weight: 25,
        triggered: !!(assessment.adverseMediaHits && assessment.adverseMediaHits.length > 0),
      },
      {
        factor: 'High-risk source of funds (GIFT / OTHER)',
        weight: 15,
        triggered:
          assessment.sourceOfFunds === CddSourceOfFunds.GIFT ||
          assessment.sourceOfFunds === CddSourceOfFunds.OTHER,
      },
      {
        factor: 'Business customer without UBO disclosure',
        weight: 20,
        triggered: !!assessment.businessNature && !assessment.beneficialOwners?.length,
      },
      {
        factor: 'No source of wealth provided',
        weight: 10,
        triggered: !assessment.sourceOfWealth,
      },
    ];

    const score = factors.reduce((acc, f) => acc + (f.triggered ? f.weight : 0), 0);

    let rating: CddRiskRating;
    if (score >= 55) rating = CddRiskRating.VERY_HIGH;
    else if (score >= 30) rating = CddRiskRating.HIGH;
    else if (score >= 15) rating = CddRiskRating.MEDIUM;
    else rating = CddRiskRating.LOW;

    return { score, rating, factors };
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findByIdOrThrow(id: string): Promise<CddAssessment> {
    const a = await this.cddRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`CDD assessment ${id} not found`);
    return a;
  }

  async findByCustomer(customerId: string): Promise<CddAssessment[]> {
    return this.cddRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async findRequiringEdd(): Promise<CddAssessment[]> {
    return this.cddRepo.find({ where: { status: CddStatus.REQUIRES_EDD }, order: { createdAt: 'ASC' } });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private nextReviewDate(rating: CddRiskRating): Date {
    const now = new Date();
    const years = rating === CddRiskRating.LOW ? 3 : rating === CddRiskRating.MEDIUM ? 2 : 1;
    now.setFullYear(now.getFullYear() + years);
    return now;
  }
}
