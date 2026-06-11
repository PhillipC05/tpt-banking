import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DealSide = 'BUY' | 'SELL';
export type DealType = 'SPOT' | 'FORWARD';
export type DealStatus = 'PENDING' | 'CONFIRMED' | 'SETTLED' | 'CANCELLED';
export type TenorLabel =
  | 'ON'   // Overnight
  | 'TN'   // Tom-Next
  | 'SN'   // Spot-Next
  | '1W'   | '2W'   | '1M'   | '2M'   | '3M'
  | '6M'   | '9M'   | '1Y';

export interface SpotRate {
  currencyPair: string;   // e.g. EUR/USD
  mid: string;
  bid: string;
  ask: string;
  timestamp: string;
}

export interface ForwardPoint {
  tenor: TenorLabel;
  daysToSettlement: number;
  bid: number;   // in pips (1 pip = 0.0001 for most pairs)
  ask: number;
}

export interface FxDeal {
  dealId: string;
  dealType: DealType;
  currencyPair: string;
  side: DealSide;
  baseCurrencyAmount: string;   // amount in base currency
  termCurrencyAmount: string;   // amount in term currency
  dealRate: string;             // all-in rate (spot + forward points for forwards)
  spotRate: string;
  forwardPoints: string;        // zero for spot deals
  tenor: TenorLabel | null;
  settlementDate: string;       // ISO date
  tradeDate: string;
  counterpartyId: string;
  traderId: string;
  portfolioId: string;
  status: DealStatus;
  unrealizedPnl: string;
  realizedPnl: string;
  confirmationRef: string | null;
}

export interface FxDealBook {
  currencyPair: string;
  openDeals: FxDeal[];
  netLongBase: string;
  netShortBase: string;
  netPosition: string;
  totalUnrealizedPnl: string;
}

// ── In-memory deal store (replace with TypeORM entity in production) ──────────

const dealStore = new Map<string, FxDeal>();

// ── Spot rate cache (would be fed from pricing-engine in production) ──────────
// Seeded with illustrative mid-market rates
const SPOT_RATES: Record<string, { mid: number; spread: number }> = {
  'EUR/USD': { mid: 1.0850, spread: 0.0002 },
  'GBP/USD': { mid: 1.2650, spread: 0.0003 },
  'USD/JPY': { mid: 149.50, spread: 0.05 },
  'USD/CHF': { mid: 0.9020, spread: 0.0003 },
  'AUD/USD': { mid: 0.6550, spread: 0.0003 },
  'USD/CAD': { mid: 1.3620, spread: 0.0004 },
  'NZD/USD': { mid: 0.6050, spread: 0.0004 },
  'EUR/GBP': { mid: 0.8570, spread: 0.0002 },
  'EUR/JPY': { mid: 162.20, spread: 0.06 },
  'GBP/JPY': { mid: 189.10, spread: 0.08 },
};

// ── Forward points (pips) — simplified interest-rate-parity derived values ───
// In production these would come from the yield curve service in pricing-engine
const FORWARD_POINTS: Record<string, ForwardPoint[]> = {
  'EUR/USD': [
    { tenor: 'ON',  daysToSettlement: 1,   bid: -0.1,  ask: 0.1  },
    { tenor: 'TN',  daysToSettlement: 2,   bid: -0.2,  ask: 0.2  },
    { tenor: '1W',  daysToSettlement: 7,   bid: -0.8,  ask: -0.6 },
    { tenor: '2W',  daysToSettlement: 14,  bid: -1.6,  ask: -1.4 },
    { tenor: '1M',  daysToSettlement: 30,  bid: -3.5,  ask: -3.3 },
    { tenor: '2M',  daysToSettlement: 60,  bid: -7.0,  ask: -6.8 },
    { tenor: '3M',  daysToSettlement: 90,  bid: -10.5, ask: -10.2 },
    { tenor: '6M',  daysToSettlement: 180, bid: -21.0, ask: -20.6 },
    { tenor: '9M',  daysToSettlement: 270, bid: -31.5, ask: -31.0 },
    { tenor: '1Y',  daysToSettlement: 360, bid: -42.0, ask: -41.4 },
  ],
  'GBP/USD': [
    { tenor: 'ON',  daysToSettlement: 1,   bid: 0.1,   ask: 0.3  },
    { tenor: '1W',  daysToSettlement: 7,   bid: 0.5,   ask: 0.7  },
    { tenor: '1M',  daysToSettlement: 30,  bid: 2.0,   ask: 2.4  },
    { tenor: '3M',  daysToSettlement: 90,  bid: 6.0,   ask: 6.6  },
    { tenor: '6M',  daysToSettlement: 180, bid: 12.0,  ask: 13.0 },
    { tenor: '1Y',  daysToSettlement: 360, bid: 24.0,  ask: 26.0 },
  ],
  'USD/JPY': [
    { tenor: 'ON',  daysToSettlement: 1,   bid: 1.0,   ask: 2.0   },
    { tenor: '1W',  daysToSettlement: 7,   bid: 7.0,   ask: 9.0   },
    { tenor: '1M',  daysToSettlement: 30,  bid: 30.0,  ask: 33.0  },
    { tenor: '3M',  daysToSettlement: 90,  bid: 90.0,  ask: 95.0  },
    { tenor: '6M',  daysToSettlement: 180, bid: 180.0, ask: 188.0 },
    { tenor: '1Y',  daysToSettlement: 360, bid: 360.0, ask: 375.0 },
  ],
};

const PIP_SIZE: Record<string, number> = {
  'USD/JPY': 0.01,
  'EUR/JPY': 0.01,
  'GBP/JPY': 0.01,
};
const DEFAULT_PIP = 0.0001;

function pipSize(pair: string): number {
  return PIP_SIZE[pair] ?? DEFAULT_PIP;
}

@Injectable()
export class FxDeskService {
  private readonly logger = new Logger(FxDeskService.name);

  // ── Market data ──────────────────────────────────────────────────────────────

  getSpotRate(currencyPair: string): SpotRate {
    const entry = SPOT_RATES[currencyPair.toUpperCase()];
    if (!entry) throw new NotFoundException(`No spot rate found for ${currencyPair}`);
    const bid = new Decimal(entry.mid).minus(entry.spread / 2).toFixed(5);
    const ask = new Decimal(entry.mid).plus(entry.spread / 2).toFixed(5);
    return {
      currencyPair,
      mid: entry.mid.toFixed(5),
      bid,
      ask,
      timestamp: new Date().toISOString(),
    };
  }

  getAllSpotRates(): SpotRate[] {
    return Object.keys(SPOT_RATES).map((p) => this.getSpotRate(p));
  }

  getForwardPoints(currencyPair: string): ForwardPoint[] {
    const pts = FORWARD_POINTS[currencyPair.toUpperCase()];
    if (!pts) throw new NotFoundException(`No forward points for ${currencyPair}`);
    return pts;
  }

  getForwardRate(currencyPair: string, tenor: TenorLabel): {
    currencyPair: string;
    tenor: TenorLabel;
    spotMid: string;
    forwardPointsBid: string;
    forwardPointsAsk: string;
    forwardBid: string;
    forwardAsk: string;
    forwardMid: string;
    daysToSettlement: number;
  } {
    const spot = this.getSpotRate(currencyPair);
    const pts = this.getForwardPoints(currencyPair);
    const pt = pts.find((p) => p.tenor === tenor);
    if (!pt) throw new NotFoundException(`No ${tenor} forward point for ${currencyPair}`);

    const pip = pipSize(currencyPair);
    const spotMid = new Decimal(spot.mid);
    const fwdBid = spotMid.plus(new Decimal(pt.bid).times(pip));
    const fwdAsk = spotMid.plus(new Decimal(pt.ask).times(pip));
    const fwdMid = fwdBid.plus(fwdAsk).dividedBy(2);

    return {
      currencyPair,
      tenor,
      spotMid: spot.mid,
      forwardPointsBid: pt.bid.toString(),
      forwardPointsAsk: pt.ask.toString(),
      forwardBid: fwdBid.toFixed(5),
      forwardAsk: fwdAsk.toFixed(5),
      forwardMid: fwdMid.toFixed(5),
      daysToSettlement: pt.daysToSettlement,
    };
  }

  // ── Deal booking ─────────────────────────────────────────────────────────────

  bookSpotDeal(params: {
    currencyPair: string;
    side: DealSide;
    baseCurrencyAmount: number;
    counterpartyId: string;
    traderId: string;
    portfolioId: string;
  }): FxDeal {
    const spot = this.getSpotRate(params.currencyPair);
    const pip = pipSize(params.currencyPair);
    const entry = SPOT_RATES[params.currencyPair.toUpperCase()]!;

    // Client buys base → they pay ask; client sells base → they receive bid
    const dealRate = params.side === 'BUY'
      ? new Decimal(spot.ask)
      : new Decimal(spot.bid);

    const baseAmt = new Decimal(params.baseCurrencyAmount);
    const termAmt = baseAmt.times(dealRate);

    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() + 2); // T+2 spot

    const deal: FxDeal = {
      dealId: uuidv4(),
      dealType: 'SPOT',
      currencyPair: params.currencyPair,
      side: params.side,
      baseCurrencyAmount: baseAmt.toFixed(2),
      termCurrencyAmount: termAmt.toFixed(2),
      dealRate: dealRate.toFixed(5),
      spotRate: spot.mid,
      forwardPoints: '0',
      tenor: null,
      settlementDate: settlementDate.toISOString().split('T')[0]!,
      tradeDate: new Date().toISOString().split('T')[0]!,
      counterpartyId: params.counterpartyId,
      traderId: params.traderId,
      portfolioId: params.portfolioId,
      status: 'CONFIRMED',
      unrealizedPnl: '0.00',
      realizedPnl: '0.00',
      confirmationRef: `SPOT-${Date.now()}`,
    };

    dealStore.set(deal.dealId, deal);
    this.logger.log(`Spot deal booked: ${deal.dealId} ${params.side} ${baseAmt.toFixed(0)} ${params.currencyPair} @ ${dealRate.toFixed(5)}`);
    return deal;
  }

  bookForwardDeal(params: {
    currencyPair: string;
    side: DealSide;
    baseCurrencyAmount: number;
    tenor: TenorLabel;
    counterpartyId: string;
    traderId: string;
    portfolioId: string;
  }): FxDeal {
    const fwd = this.getForwardRate(params.currencyPair, params.tenor);
    const pip = pipSize(params.currencyPair);

    const dealRate = params.side === 'BUY'
      ? new Decimal(fwd.forwardAsk)
      : new Decimal(fwd.forwardBid);

    const spotRate = new Decimal(fwd.spotMid);
    const forwardPts = dealRate.minus(spotRate);

    const baseAmt = new Decimal(params.baseCurrencyAmount);
    const termAmt = baseAmt.times(dealRate);

    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() + fwd.daysToSettlement);

    const deal: FxDeal = {
      dealId: uuidv4(),
      dealType: 'FORWARD',
      currencyPair: params.currencyPair,
      side: params.side,
      baseCurrencyAmount: baseAmt.toFixed(2),
      termCurrencyAmount: termAmt.toFixed(2),
      dealRate: dealRate.toFixed(5),
      spotRate: fwd.spotMid,
      forwardPoints: forwardPts.toFixed(5),
      tenor: params.tenor,
      settlementDate: settlementDate.toISOString().split('T')[0]!,
      tradeDate: new Date().toISOString().split('T')[0]!,
      counterpartyId: params.counterpartyId,
      traderId: params.traderId,
      portfolioId: params.portfolioId,
      status: 'CONFIRMED',
      unrealizedPnl: '0.00',
      realizedPnl: '0.00',
      confirmationRef: `FWD-${params.tenor}-${Date.now()}`,
    };

    dealStore.set(deal.dealId, deal);
    this.logger.log(`Forward deal booked: ${deal.dealId} ${params.side} ${baseAmt.toFixed(0)} ${params.currencyPair} ${params.tenor} @ ${dealRate.toFixed(5)}`);
    return deal;
  }

  getDeal(dealId: string): FxDeal {
    const deal = dealStore.get(dealId);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    return deal;
  }

  cancelDeal(dealId: string): FxDeal {
    const deal = this.getDeal(dealId);
    if (deal.status === 'SETTLED') {
      throw new BadRequestException('Cannot cancel a settled deal');
    }
    deal.status = 'CANCELLED';
    dealStore.set(dealId, deal);
    return deal;
  }

  settleDeal(dealId: string): FxDeal {
    const deal = this.getDeal(dealId);
    if (deal.status !== 'CONFIRMED') {
      throw new BadRequestException(`Deal must be in CONFIRMED status to settle (currently ${deal.status})`);
    }
    deal.status = 'SETTLED';

    // Mark-to-market P&L vs. current spot
    const spot = this.getSpotRate(deal.currencyPair);
    const currentMid = new Decimal(spot.mid);
    const dealRate = new Decimal(deal.dealRate);
    const baseAmt = new Decimal(deal.baseCurrencyAmount);

    const mtmPnl = deal.side === 'BUY'
      ? currentMid.minus(dealRate).times(baseAmt)
      : dealRate.minus(currentMid).times(baseAmt);

    deal.realizedPnl = mtmPnl.toFixed(2);
    deal.unrealizedPnl = '0.00';
    dealStore.set(dealId, deal);
    return deal;
  }

  // ── Deal book ────────────────────────────────────────────────────────────────

  getDealBook(currencyPair?: string): FxDealBook[] {
    const pairs = currencyPair
      ? [currencyPair.toUpperCase()]
      : [...new Set([...dealStore.values()].map((d) => d.currencyPair))];

    return pairs.map((pair) => {
      const openDeals = [...dealStore.values()].filter(
        (d) => d.currencyPair === pair && d.status === 'CONFIRMED',
      );

      let netLong = new Decimal(0);
      let netShort = new Decimal(0);
      let totalPnl = new Decimal(0);

      for (const deal of openDeals) {
        const base = new Decimal(deal.baseCurrencyAmount);
        if (deal.side === 'BUY') netLong = netLong.plus(base);
        else netShort = netShort.plus(base);
        totalPnl = totalPnl.plus(new Decimal(deal.unrealizedPnl));
      }

      return {
        currencyPair: pair,
        openDeals,
        netLongBase: netLong.toFixed(2),
        netShortBase: netShort.toFixed(2),
        netPosition: netLong.minus(netShort).toFixed(2),
        totalUnrealizedPnl: totalPnl.toFixed(2),
      };
    });
  }

  // ── Mark-to-market ───────────────────────────────────────────────────────────

  markToMarket(dealId: string): { dealId: string; currentRate: string; unrealizedPnl: string } {
    const deal = this.getDeal(dealId);
    if (deal.status !== 'CONFIRMED') {
      return { dealId, currentRate: deal.dealRate, unrealizedPnl: deal.unrealizedPnl };
    }

    const spot = this.getSpotRate(deal.currencyPair);
    const currentMid = new Decimal(spot.mid);
    const dealRate = new Decimal(deal.dealRate);
    const baseAmt = new Decimal(deal.baseCurrencyAmount);

    const pnl = deal.side === 'BUY'
      ? currentMid.minus(dealRate).times(baseAmt)
      : dealRate.minus(currentMid).times(baseAmt);

    deal.unrealizedPnl = pnl.toFixed(2);
    dealStore.set(dealId, deal);

    return { dealId, currentRate: currentMid.toFixed(5), unrealizedPnl: deal.unrealizedPnl };
  }

  // ── Desk summary ─────────────────────────────────────────────────────────────

  getDeskSummary(): {
    totalOpenDeals: number;
    spotDeals: number;
    forwardDeals: number;
    totalUnrealizedPnl: string;
    totalRealizedPnl: string;
    netExposureByCurrency: Record<string, string>;
  } {
    const all = [...dealStore.values()];
    const open = all.filter((d) => d.status === 'CONFIRMED');
    const settled = all.filter((d) => d.status === 'SETTLED');

    const exposure: Record<string, Decimal> = {};
    let totalUnrealized = new Decimal(0);
    let totalRealized = new Decimal(0);

    for (const deal of open) {
      const [base] = deal.currencyPair.split('/');
      if (!base) continue;
      if (!exposure[base]) exposure[base] = new Decimal(0);
      const baseAmt = new Decimal(deal.baseCurrencyAmount);
      exposure[base] = deal.side === 'BUY'
        ? exposure[base].plus(baseAmt)
        : exposure[base].minus(baseAmt);
      totalUnrealized = totalUnrealized.plus(new Decimal(deal.unrealizedPnl));
    }
    for (const deal of settled) {
      totalRealized = totalRealized.plus(new Decimal(deal.realizedPnl));
    }

    const netExposureByCurrency: Record<string, string> = {};
    for (const [ccy, val] of Object.entries(exposure)) {
      netExposureByCurrency[ccy] = val.toFixed(2);
    }

    return {
      totalOpenDeals: open.length,
      spotDeals: open.filter((d) => d.dealType === 'SPOT').length,
      forwardDeals: open.filter((d) => d.dealType === 'FORWARD').length,
      totalUnrealizedPnl: totalUnrealized.toFixed(2),
      totalRealizedPnl: totalRealized.toFixed(2),
      netExposureByCurrency,
    };
  }
}
