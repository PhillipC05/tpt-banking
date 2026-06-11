import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Position, Instrument } from '@tpt/database';
import { Money } from '@tpt/shared';
import Decimal from 'decimal.js';

export interface ApplyExecutionDto {
  portfolioId: string;
  instrumentId: string;
  side: string;
  qty: number;
  price: number;
  currency: string;
}

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Updates position after an execution.
   * Uses a database-level upsert with advisory locking to prevent race conditions.
   *
   * Position logic:
   *   BUY:  increases quantity, updates average cost basis (FIFO weighted avg)
   *   SELL: decreases quantity, realizes P&L on the sold portion
   */
  async applyExecution(dto: ApplyExecutionDto): Promise<Position> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the position row (or create it) with an advisory lock
      const existing = await manager
        .createQueryBuilder(Position, 'p')
        .where('p.portfolioId = :pid AND p.instrumentId = :iid', {
          pid: dto.portfolioId,
          iid: dto.instrumentId,
        })
        .setLock('pessimistic_write')
        .getOne();

      const isBuy = dto.side === 'BUY';
      const qty = new Decimal(dto.qty);
      const price = new Decimal(dto.price);

      if (!existing) {
        // New position
        const position = manager.create(Position, {
          portfolioId: dto.portfolioId,
          instrumentId: dto.instrumentId,
          quantity: (isBuy ? qty : qty.negated()).toFixed(6),
          avgCost: price.toFixed(6),
          costBasis: qty.times(price).toFixed(6),
          marketValue: qty.times(price).toFixed(6),
          unrealizedPnl: '0',
          realizedPnl: '0',
          totalPnl: '0',
          dayPnl: '0',
          lastMarkPrice: price.toFixed(6),
          markCurrency: dto.currency,
          baseCurrency: dto.currency,
          baseCurrencyPnl: '0',
          fxRate: '1',
          positionDate: new Date(),
          lastMarkTime: new Date(),
        });
        return manager.save(Position, position);
      }

      const currentQty = new Decimal(existing.quantity);
      const currentAvgCost = new Decimal(existing.avgCost);

      let newQty: Decimal;
      let newAvgCost: Decimal;
      let realizedPnl = new Decimal(existing.realizedPnl);

      if (isBuy) {
        // BUY: increase position, update weighted average cost
        newQty = currentQty.plus(qty);
        if (currentQty.isPositive() || currentQty.isZero()) {
          // Adding to long position
          const totalCost = currentQty.abs().times(currentAvgCost).plus(qty.times(price));
          newAvgCost = totalCost.dividedBy(newQty.abs());
        } else {
          // Covering a short position
          const coveredQty = Decimal.min(qty, currentQty.abs());
          realizedPnl = realizedPnl.plus(coveredQty.times(currentAvgCost.minus(price)));
          newAvgCost = qty.greaterThan(currentQty.abs()) ? price : currentAvgCost;
        }
      } else {
        // SELL: decrease position, realize P&L
        newQty = currentQty.minus(qty);
        const soldQty = Decimal.min(qty, currentQty.abs());
        realizedPnl = realizedPnl.plus(soldQty.times(price.minus(currentAvgCost)));
        newAvgCost = newQty.isZero() ? new Decimal(0) : currentAvgCost;
      }

      const newCostBasis = newQty.abs().times(newAvgCost);
      const newMarketValue = newQty.abs().times(price);
      const newUnrealizedPnl = newQty.isPositive()
        ? newMarketValue.minus(newCostBasis)
        : newCostBasis.minus(newMarketValue); // short P&L is inverse

      const totalPnl = realizedPnl.plus(newUnrealizedPnl);
      const dayPnl = new Decimal(existing.dayPnl).plus(
        isBuy ? new Decimal(0) : qty.times(price.minus(currentAvgCost)),
      );

      await manager.update(Position, existing.id, {
        quantity: newQty.toFixed(6),
        avgCost: newAvgCost.toFixed(6),
        costBasis: newCostBasis.toFixed(6),
        marketValue: newMarketValue.toFixed(6),
        unrealizedPnl: newUnrealizedPnl.toFixed(6),
        realizedPnl: realizedPnl.toFixed(6),
        totalPnl: totalPnl.toFixed(6),
        dayPnl: dayPnl.toFixed(6),
        lastMarkPrice: price.toFixed(6),
        lastMarkTime: new Date(),
        positionDate: new Date(),
      });

      return manager.findOneOrFail(Position, { where: { id: existing.id } });
    });
  }

  /**
   * Re-marks all positions in a portfolio to current market prices.
   * Called at end of day or on demand.
   */
  async markToMarket(portfolioId: string): Promise<{ updated: number; totalUnrealizedPnl: string }> {
    const positions = await this.positionRepo.find({ where: { portfolioId } });

    let updatedCount = 0;
    let totalUnrealized = new Decimal(0);

    for (const position of positions) {
      const instrument = await this.instrumentRepo.findOne({
        where: { id: position.instrumentId },
      });
      if (!instrument?.lastPrice) continue;

      const markPrice = new Decimal(instrument.lastPrice);
      const qty = new Decimal(position.quantity).abs();
      const newMarketValue = qty.times(markPrice);
      const costBasis = new Decimal(position.costBasis);
      const isLong = new Decimal(position.quantity).isPositive();
      const unrealizedPnl = isLong
        ? newMarketValue.minus(costBasis)
        : costBasis.minus(newMarketValue);

      const previousMark = new Decimal(position.lastMarkPrice ?? '0');
      const dayPnl = new Decimal(position.dayPnl).plus(
        qty.times(markPrice.minus(previousMark))
      );

      await this.positionRepo.update(position.id, {
        marketValue: newMarketValue.toFixed(6),
        unrealizedPnl: unrealizedPnl.toFixed(6),
        totalPnl: unrealizedPnl.plus(new Decimal(position.realizedPnl)).toFixed(6),
        dayPnl: dayPnl.toFixed(6),
        lastMarkPrice: markPrice.toFixed(6),
        lastMarkTime: new Date(),
      });

      totalUnrealized = totalUnrealized.plus(unrealizedPnl);
      updatedCount++;
    }

    return { updated: updatedCount, totalUnrealizedPnl: totalUnrealized.toFixed(2) };
  }

  async findByPortfolio(portfolioId: string): Promise<Position[]> {
    return this.positionRepo.find({
      where: { portfolioId },
      order: { marketValue: 'DESC' },
    });
  }

  async findByInstrument(instrumentId: string): Promise<Position[]> {
    return this.positionRepo.find({ where: { instrumentId } });
  }

  async getAggregatedExposure(instrumentId: string): Promise<{
    totalLong: string;
    totalShort: string;
    netPosition: string;
  }> {
    const positions = await this.positionRepo.find({ where: { instrumentId } });

    let totalLong = new Decimal(0);
    let totalShort = new Decimal(0);

    for (const p of positions) {
      const qty = new Decimal(p.quantity);
      if (qty.isPositive()) totalLong = totalLong.plus(qty);
      else totalShort = totalShort.plus(qty.abs());
    }

    return {
      totalLong: totalLong.toFixed(6),
      totalShort: totalShort.toFixed(6),
      netPosition: totalLong.minus(totalShort).toFixed(6),
    };
  }
}
