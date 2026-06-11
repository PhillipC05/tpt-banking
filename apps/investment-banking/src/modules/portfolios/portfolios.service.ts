import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Portfolio, PortfolioType, PortfolioStatus, RiskProfile, Position,
} from '@tpt/database';
import { Money } from '@tpt/shared';

export interface CreatePortfolioDto {
  portfolioCode: string;
  displayName: string;
  description?: string;
  type: PortfolioType;
  riskProfile?: RiskProfile;
  baseCurrency: string;
  ownerId?: string;
  managerId?: string;
  benchmark?: string;
  inceptionDate?: Date;
  ipsBounds?: Portfolio['ipsBounds'];
}

@Injectable()
export class PortfoliosService {
  constructor(
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
  ) {}

  async create(dto: CreatePortfolioDto): Promise<Portfolio> {
    const existing = await this.portfolioRepo.findOne({
      where: { portfolioCode: dto.portfolioCode },
    });
    if (existing) {
      throw new BadRequestException(`Portfolio code ${dto.portfolioCode} already exists`);
    }

    const portfolio = this.portfolioRepo.create({
      portfolioCode: dto.portfolioCode.toUpperCase(),
      displayName: dto.displayName,
      description: dto.description ?? null,
      type: dto.type,
      riskProfile: dto.riskProfile ?? RiskProfile.BALANCED,
      baseCurrency: dto.baseCurrency.toUpperCase(),
      ownerId: dto.ownerId ?? null,
      managerId: dto.managerId ?? null,
      benchmark: dto.benchmark ?? null,
      inceptionDate: dto.inceptionDate ?? null,
      ipsBounds: dto.ipsBounds ?? null,
      status: PortfolioStatus.ACTIVE,
    });

    return this.portfolioRepo.save(portfolio);
  }

  async findByIdOrThrow(id: string): Promise<Portfolio> {
    const p = await this.portfolioRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Portfolio ${id} not found`);
    return p;
  }

  async findByCode(code: string): Promise<Portfolio | null> {
    return this.portfolioRepo.findOne({ where: { portfolioCode: code.toUpperCase() } });
  }

  async findByOwner(ownerId: string): Promise<Portfolio[]> {
    return this.portfolioRepo.find({
      where: { ownerId, status: PortfolioStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(filters?: { type?: PortfolioType; managerId?: string }): Promise<Portfolio[]> {
    const qb = this.portfolioRepo
      .createQueryBuilder('p')
      .where("p.status = 'ACTIVE'")
      .orderBy('p.displayName', 'ASC');
    if (filters?.type) qb.andWhere('p.type = :type', { type: filters.type });
    if (filters?.managerId) qb.andWhere('p.managerId = :mid', { mid: filters.managerId });
    return qb.getMany();
  }

  async getPositions(portfolioId: string): Promise<Position[]> {
    await this.findByIdOrThrow(portfolioId);
    return this.positionRepo.find({
      where: { portfolioId },
      order: { marketValue: 'DESC' },
    });
  }

  /**
   * Recalculates portfolio totals from all positions.
   * Called after each position update.
   */
  async recalculateTotals(portfolioId: string): Promise<Portfolio> {
    const positions = await this.positionRepo.find({ where: { portfolioId } });

    const portfolio = await this.findByIdOrThrow(portfolioId);
    const base = portfolio.baseCurrency;

    let totalMv = Money.zero(base);
    let totalUnrealized = Money.zero(base);
    let totalRealized = Money.zero(base);
    let dayPnl = Money.zero(base);

    for (const pos of positions) {
      const mv = Money.fromDecimalString(pos.baseCurrencyPnl, base).add(
        Money.fromDecimalString(pos.costBasis, pos.markCurrency || base),
      );
      totalMv = totalMv.add(Money.fromDecimalString(pos.marketValue, pos.markCurrency || base));
      totalUnrealized = totalUnrealized.add(Money.fromDecimalString(pos.unrealizedPnl, base));
      totalRealized = totalRealized.add(Money.fromDecimalString(pos.realizedPnl, base));
      dayPnl = dayPnl.add(Money.fromDecimalString(pos.dayPnl, base));
    }

    await this.portfolioRepo.update(portfolioId, {
      totalMarketValue: totalMv.toDecimalString(),
      totalUnrealizedPnl: totalUnrealized.toDecimalString(),
      totalRealizedPnl: totalRealized.toDecimalString(),
      dayPnl: dayPnl.toDecimalString(),
      lastValuedAt: new Date(),
    });

    return this.findByIdOrThrow(portfolioId);
  }

  async checkIpsCompliance(
    portfolioId: string,
    instrumentId: string,
    newQuantity: number,
    price: number,
  ): Promise<{ compliant: boolean; violations: string[] }> {
    const portfolio = await this.findByIdOrThrow(portfolioId);
    const violations: string[] = [];

    if (!portfolio.ipsBounds) return { compliant: true, violations: [] };

    const { maxSinglePositionPct, maxEquityPct, maxFixedIncomePct } = portfolio.ipsBounds;
    const totalMv = parseFloat(portfolio.totalMarketValue) || 1;
    const newPositionValue = newQuantity * price;
    const newPositionPct = (newPositionValue / totalMv) * 100;

    if (maxSinglePositionPct && newPositionPct > maxSinglePositionPct) {
      violations.push(
        `Single position would be ${newPositionPct.toFixed(1)}% of portfolio, ` +
        `exceeding IPS limit of ${maxSinglePositionPct}%`,
      );
    }

    return { compliant: violations.length === 0, violations };
  }
}
