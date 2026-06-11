import { Injectable } from '@nestjs/common';
import { normCdf, normPdf, discountFactor } from '../../lib/statistics';

// ── Option position types ─────────────────────────────────────────────────────

export type OptionType = 'call' | 'put';

export interface OptionPosition {
  symbol: string;
  /** Net quantity (+ = long, - = short) */
  quantity: number;
  spot: number;
  strike: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  timeToExpiry: number;
  optionType: OptionType;
  /** Notional multiplier per contract (e.g. 100 for equity options) */
  multiplier?: number;
}

export interface PositionGreeks {
  symbol: string;
  quantity: number;
  unitDelta: number;
  unitGamma: number;
  unitVega: number;
  unitTheta: number;
  unitRho: number;
  /** Dollar Greeks (quantity × multiplier × unit Greek) */
  dollarDelta: number;
  dollarGamma: number;
  dollarVega: number;
  dollarTheta: number;
  dollarRho: number;
  price: number;
  marketValue: number;
}

export interface PortfolioGreeksResult {
  positions: PositionGreeks[];
  /** Aggregated portfolio-level Greeks */
  portfolio: {
    totalDelta: number;
    totalGamma: number;
    totalVega: number;
    totalTheta: number;
    totalRho: number;
    netMarketValue: number;
    deltaAdjustedNotional: number;
  };
  /** Risk sensitivities summary */
  sensitivities: {
    dv01: number;           // Dollar duration per 1bp rate move
    vegaP01: number;        // P&L per 1% vol increase across all positions
    thetaPerDay: number;    // Time decay per calendar day
    deltaHedgeNotional: number;  // Notional of underlying needed to delta-hedge
  };
}

// ── BSM helpers (self-contained to avoid cross-app dependency) ────────────────

function bsmPrice(
  S: number, K: number, r: number, q: number, σ: number, T: number, isCall: boolean,
): { price: number; d1: number; d2: number } {
  if (T <= 0) {
    const intrinsic = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, d1: 0, d2: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * σ * σ) * T) / (σ * sqrtT);
  const d2 = d1 - σ * sqrtT;
  const df = discountFactor(r, T);
  const qdf = discountFactor(q, T);
  const price = isCall
    ? S * qdf * normCdf(d1) - K * df * normCdf(d2)
    : K * df * normCdf(-d2) - S * qdf * normCdf(-d1);
  return { price, d1, d2 };
}

/**
 * Portfolio-level Greeks aggregation service.
 *
 * Computes BSM Greeks for each option position and aggregates to portfolio level.
 * Supports mixed long/short positions, multiple underlyings, calls and puts.
 * Reports both unit Greeks and dollar Greeks (scaled by quantity × multiplier).
 */
@Injectable()
export class PortfolioGreeksService {

  computePortfolioGreeks(positions: OptionPosition[]): PortfolioGreeksResult {
    const positionGreeks = positions.map((pos) => this.computePositionGreeks(pos));

    const totalDelta = positionGreeks.reduce((s, p) => s + p.dollarDelta, 0);
    const totalGamma = positionGreeks.reduce((s, p) => s + p.dollarGamma, 0);
    const totalVega  = positionGreeks.reduce((s, p) => s + p.dollarVega, 0);
    const totalTheta = positionGreeks.reduce((s, p) => s + p.dollarTheta, 0);
    const totalRho   = positionGreeks.reduce((s, p) => s + p.dollarRho, 0);
    const netMarketValue = positionGreeks.reduce((s, p) => s + p.marketValue, 0);

    // Delta-adjusted notional: sum |delta| × spot × multiplier × |quantity|
    const deltaAdjustedNotional = positions.reduce((s, pos, i) => {
      const m = pos.multiplier ?? 1;
      return s + Math.abs(positionGreeks[i].unitDelta) * pos.spot * m * Math.abs(pos.quantity);
    }, 0);

    // DV01: rho per 1bp = dollarRho / 100 (rho is per 1% = 100bps)
    const dv01 = totalRho / 100;

    return {
      positions: positionGreeks,
      portfolio: {
        totalDelta,
        totalGamma,
        totalVega,
        totalTheta,
        totalRho,
        netMarketValue,
        deltaAdjustedNotional,
      },
      sensitivities: {
        dv01,
        vegaP01: totalVega,        // dollarVega is already per 1% vol
        thetaPerDay: totalTheta,   // dollarTheta is per calendar day
        deltaHedgeNotional: -totalDelta,
      },
    };
  }

  computePositionGreeks(pos: OptionPosition): PositionGreeks {
    const { spot: S, strike: K, riskFreeRate: r, dividendYield: q, volatility: σ, timeToExpiry: T } = pos;
    const isCall = pos.optionType === 'call';
    const m = pos.multiplier ?? 1;

    const { price, d1, d2 } = bsmPrice(S, K, r, q, σ, T, isCall);

    if (T <= 0) {
      const sign = isCall ? 1 : -1;
      const unitDelta = isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
      return this.buildPositionGreeks(pos, price, unitDelta, 0, 0, 0, 0);
    }

    const sqrtT = Math.sqrt(T);
    const df  = discountFactor(r, T);
    const qdf = discountFactor(q, T);
    const nd1 = normPdf(d1);
    const sign = isCall ? 1 : -1;

    const unitDelta = isCall ? qdf * normCdf(d1)  : -qdf * normCdf(-d1);
    const unitGamma = (qdf * nd1) / (S * σ * sqrtT);
    const unitVega  = (S * qdf * nd1 * sqrtT) / 100;  // per 1% vol
    const unitTheta = (
      -(S * qdf * nd1 * σ) / (2 * sqrtT)
      - sign * r * K * df * normCdf(sign * d2)
      + sign * q * S * qdf * normCdf(sign * d1)
    ) / 365;
    const unitRho = sign * K * T * df * normCdf(sign * d2) / 100;  // per 1%

    return this.buildPositionGreeks(pos, price, unitDelta, unitGamma, unitVega, unitTheta, unitRho);
  }

  private buildPositionGreeks(
    pos: OptionPosition,
    price: number,
    unitDelta: number,
    unitGamma: number,
    unitVega: number,
    unitTheta: number,
    unitRho: number,
  ): PositionGreeks {
    const m = pos.multiplier ?? 1;
    const scale = pos.quantity * m;
    return {
      symbol: pos.symbol,
      quantity: pos.quantity,
      unitDelta,
      unitGamma,
      unitVega,
      unitTheta,
      unitRho,
      dollarDelta: unitDelta * scale * pos.spot,
      dollarGamma: unitGamma * scale * pos.spot * pos.spot / 100,  // per 1% move in spot
      dollarVega:  unitVega  * scale,
      dollarTheta: unitTheta * scale,
      dollarRho:   unitRho   * scale,
      price,
      marketValue: price * scale,
    };
  }
}
