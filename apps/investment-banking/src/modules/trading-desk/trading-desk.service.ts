import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Order, OrderStatus, Position, Instrument, AssetClass, Portfolio,
} from '@tpt/database';
import Decimal from 'decimal.js';

interface DeskDashboard {
  desk: string;
  openOrderCount: number;
  totalDayPnl: string;
  totalUnrealizedPnl: string;
  netNotionalExposure: string;
  topPositions: Array<{
    instrumentId: string;
    ticker: string | null;
    quantity: string;
    marketValue: string;
    dayPnl: string;
    unrealizedPnl: string;
  }>;
  openOrders: Order[];
}

@Injectable()
export class TradingDeskService {
  private readonly logger = new Logger(TradingDeskService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
  ) {}

  async getDeskDashboard(assetClass: AssetClass, traderId: string): Promise<DeskDashboard> {
    // Get instruments in this asset class
    const instruments = await this.instrumentRepo.find({
      where: { assetClass },
      select: ['id', 'ticker', 'displayName'],
    });
    const instrumentIds = instruments.map((i) => i.id);
    const tickerMap = new Map(instruments.map((i) => [i.id, i.ticker]));

    if (instrumentIds.length === 0) {
      return {
        desk: assetClass,
        openOrderCount: 0,
        totalDayPnl: '0.00',
        totalUnrealizedPnl: '0.00',
        netNotionalExposure: '0.00',
        topPositions: [],
        openOrders: [],
      };
    }

    // Open orders
    const openOrders = await this.orderRepo
      .createQueryBuilder('o')
      .where("o.order_status IN ('NEW','PARTIALLY_FILLED')")
      .andWhere('o.instrument_id IN (:...ids)', { ids: instrumentIds })
      .orderBy('o.transact_time', 'DESC')
      .limit(50)
      .getMany();

    // Positions
    const positions = await this.positionRepo
      .createQueryBuilder('p')
      .where('p.instrument_id IN (:...ids)', { ids: instrumentIds })
      .getMany();

    let totalDayPnl = new Decimal(0);
    let totalUnrealized = new Decimal(0);
    let netNotional = new Decimal(0);

    for (const pos of positions) {
      totalDayPnl = totalDayPnl.plus(new Decimal(pos.dayPnl));
      totalUnrealized = totalUnrealized.plus(new Decimal(pos.unrealizedPnl));
      netNotional = netNotional.plus(new Decimal(pos.marketValue).times(
        new Decimal(pos.quantity).isPositive() ? 1 : -1,
      ));
    }

    const topPositions = positions
      .sort((a, b) => Math.abs(parseFloat(b.marketValue)) - Math.abs(parseFloat(a.marketValue)))
      .slice(0, 10)
      .map((p) => ({
        instrumentId: p.instrumentId,
        ticker: tickerMap.get(p.instrumentId) ?? null,
        quantity: p.quantity,
        marketValue: p.marketValue,
        dayPnl: p.dayPnl,
        unrealizedPnl: p.unrealizedPnl,
      }));

    return {
      desk: assetClass,
      openOrderCount: openOrders.length,
      totalDayPnl: totalDayPnl.toFixed(2),
      totalUnrealizedPnl: totalUnrealized.toFixed(2),
      netNotionalExposure: netNotional.toFixed(2),
      topPositions,
      openOrders,
    };
  }

  async getFirmWideExposure(): Promise<Array<{ assetClass: string; longNotional: string; shortNotional: string; netExposure: string }>> {
    const results: Array<{ assetClass: string; longNotional: string; shortNotional: string; netExposure: string }> = [];

    for (const ac of Object.values(AssetClass)) {
      const instruments = await this.instrumentRepo.find({
        where: { assetClass: ac },
        select: ['id'],
      });
      if (instruments.length === 0) continue;

      const positions = await this.positionRepo
        .createQueryBuilder('p')
        .where('p.instrument_id IN (:...ids)', { ids: instruments.map((i) => i.id) })
        .getMany();

      let longNotional = new Decimal(0);
      let shortNotional = new Decimal(0);

      for (const pos of positions) {
        const mv = new Decimal(pos.marketValue);
        if (new Decimal(pos.quantity).isPositive()) {
          longNotional = longNotional.plus(mv);
        } else {
          shortNotional = shortNotional.plus(mv);
        }
      }

      if (!longNotional.isZero() || !shortNotional.isZero()) {
        results.push({
          assetClass: ac,
          longNotional: longNotional.toFixed(2),
          shortNotional: shortNotional.toFixed(2),
          netExposure: longNotional.minus(shortNotional).toFixed(2),
        });
      }
    }

    return results;
  }

  async getFirmWidePnl(): Promise<{
    totalDayPnl: string;
    totalUnrealizedPnl: string;
    totalRealizedPnl: string;
    portfolioCount: number;
  }> {
    const portfolios = await this.portfolioRepo.find({
      where: { status: 'ACTIVE' as any },
    });

    return {
      totalDayPnl: portfolios.reduce((s, p) => s.plus(new Decimal(p.dayPnl)), new Decimal(0)).toFixed(2),
      totalUnrealizedPnl: portfolios.reduce((s, p) => s.plus(new Decimal(p.totalUnrealizedPnl)), new Decimal(0)).toFixed(2),
      totalRealizedPnl: portfolios.reduce((s, p) => s.plus(new Decimal(p.totalRealizedPnl)), new Decimal(0)).toFixed(2),
      portfolioCount: portfolios.length,
    };
  }

  async checkRiskLimits(params: {
    instrumentId: string;
    portfolioId: string;
    side: string;
    qty: number;
    price: number;
  }): Promise<{ passed: boolean; warnings: string[]; errors: string[] }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    const notional = params.qty * params.price;

    // Hard limit: single order notional > $50M requires additional approval
    if (notional > 50_000_000) {
      errors.push(`Order notional $${notional.toLocaleString()} exceeds single-order limit of $50M`);
    }
    if (notional > 10_000_000) {
      warnings.push(`Large order: notional $${notional.toLocaleString()} — ensure desk head approval`);
    }

    // Check existing exposure
    const position = await this.positionRepo.findOne({
      where: { portfolioId: params.portfolioId, instrumentId: params.instrumentId },
    });
    if (position) {
      const currentMv = parseFloat(position.marketValue);
      const newMv = currentMv + (params.side === 'BUY' ? notional : -notional);
      if (Math.abs(newMv) > 100_000_000) {
        warnings.push(`Position would reach $${Math.abs(newMv).toLocaleString()} — approaching concentration limit`);
      }
    }

    return { passed: errors.length === 0, warnings, errors };
  }
}
