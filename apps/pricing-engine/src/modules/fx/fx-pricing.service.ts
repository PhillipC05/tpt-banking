import { Injectable, Logger } from '@nestjs/common';

export interface FxSpotQuote {
  baseCurrency: string;
  quoteCurrency: string;
  pair: string;       // e.g. 'EURUSD'
  spot: number;
  bid: number;
  ask: number;
  midSpread: number;  // bid-ask spread in pips
  timestamp: Date;
}

export interface FxForwardResult {
  pair: string;
  spot: number;
  forwardPoints: number;     // Swap points (bid/ask convention ignored for simplicity)
  outright: number;          // Forward outright = spot + forwardPoints/10000
  tenor: number;             // Tenor in years
  tenorLabel: string;        // e.g. '1M', '3M', '1Y'
  impliedYield: number;      // Implied forward rate from CIP
  baseCurrencyRate: number;
  quoteCurrencyRate: number;
}

export interface FxSwapResult {
  pair: string;
  nearLeg: FxForwardResult;
  farLeg: FxForwardResult;
  swapPoints: number;
}

export interface FxOptionPricingResult {
  price: number;
  pricePct: number;      // Price as percentage of notional
  delta: number;
  vega: number;
  gamma: number;
  impliedForward: number;
  deltaNeutralStrike: number;
  pair: string;
}

/**
 * FX pricing service.
 * Covers:
 *   1. Spot pricing (quote from market data cache)
 *   2. Forward outrights — Covered Interest Rate Parity (CIP)
 *   3. FX swaps (near + far leg)
 *   4. FX option deltas (via Garman-Kohlhagen)
 *
 * CIP forward formula:
 *   F = S * exp((r_quote - r_base) * T)
 *
 * Garman-Kohlhagen (1983) extends BSM for FX:
 *   Treat the base currency yield as the dividend yield on the spot.
 */
@Injectable()
export class FxPricingService {
  private readonly logger = new Logger(FxPricingService.name);

  // Market data cache (in production: updated by market data feed)
  private readonly spotRates = new Map<string, number>([
    ['EURUSD', 1.0850],
    ['GBPUSD', 1.2710],
    ['USDJPY', 149.50],
    ['USDCHF', 0.9040],
    ['AUDUSD', 0.6520],
    ['USDCAD', 1.3620],
    ['NZDUSD', 0.6100],
    ['EURGBP', 0.8538],
    ['EURJPY', 162.21],
    ['GBPJPY', 189.97],
    ['USDCNH', 7.2450],
    ['USDINR', 83.12],
    ['USDBRL', 5.0250],
    ['USDSGD', 1.3480],
    ['USDHKD', 7.8220],
  ]);

  // Risk-free rates by currency (annualised, used for forward pricing)
  private readonly riskFreeRates = new Map<string, number>([
    ['USD', 0.0530], ['EUR', 0.0375], ['GBP', 0.0525], ['JPY', 0.0010],
    ['CHF', 0.0175], ['AUD', 0.0435], ['CAD', 0.0500], ['NZD', 0.0575],
    ['CNH', 0.0220], ['INR', 0.0665], ['BRL', 0.1075], ['SGD', 0.0380],
    ['HKD', 0.0530], ['SEK', 0.0400], ['NOK', 0.0450],
  ]);

  getSpot(pair: string): FxSpotQuote | null {
    const pairUpper = pair.toUpperCase();
    const spot = this.spotRates.get(pairUpper);
    if (!spot) return null;

    const spread = this.getTypicalSpread(pairUpper);
    const halfSpread = spread / 2 / 10000;

    return {
      baseCurrency: pairUpper.slice(0, 3),
      quoteCurrency: pairUpper.slice(3),
      pair: pairUpper,
      spot,
      bid: spot - halfSpread,
      ask: spot + halfSpread,
      midSpread: spread,
      timestamp: new Date(),
    };
  }

  /**
   * Price an FX forward using Covered Interest Rate Parity.
   * F = S * exp((r_quote - r_base) * T)
   */
  priceForward(pair: string, tenorYears: number): FxForwardResult {
    const pairUpper = pair.toUpperCase();
    const spot = this.spotRates.get(pairUpper);
    if (!spot) throw new Error(`Unknown FX pair: ${pairUpper}`);

    const base = pairUpper.slice(0, 3);
    const quote = pairUpper.slice(3);

    const rBase = this.riskFreeRates.get(base) ?? 0.05;
    const rQuote = this.riskFreeRates.get(quote) ?? 0.05;

    // CIP: F = S * exp((r_quote - r_base) * T)
    const outright = spot * Math.exp((rQuote - rBase) * tenorYears);
    const forwardPoints = (outright - spot) * 10000; // Pips

    // Implied yield on base currency
    const impliedYield = Math.log(outright / spot) / tenorYears;

    return {
      pair: pairUpper,
      spot,
      forwardPoints,
      outright,
      tenor: tenorYears,
      tenorLabel: this.tenorToLabel(tenorYears),
      impliedYield,
      baseCurrencyRate: rBase,
      quoteCurrencyRate: rQuote,
    };
  }

  /**
   * Price FX forwards for standard tenors (1W, 1M, 3M, 6M, 1Y, 2Y).
   */
  priceForwardCurve(pair: string): FxForwardResult[] {
    const standardTenors = [
      { label: '1W', years: 7 / 365 },
      { label: '1M', years: 1 / 12 },
      { label: '2M', years: 2 / 12 },
      { label: '3M', years: 3 / 12 },
      { label: '6M', years: 6 / 12 },
      { label: '9M', years: 9 / 12 },
      { label: '1Y', years: 1 },
      { label: '2Y', years: 2 },
    ];

    return standardTenors.map(({ years }) => this.priceForward(pair, years));
  }

  /**
   * Price an FX swap (near + far leg).
   */
  priceFxSwap(pair: string, nearTenor: number, farTenor: number): FxSwapResult {
    const nearLeg = this.priceForward(pair, nearTenor);
    const farLeg = this.priceForward(pair, farTenor);
    const swapPoints = farLeg.forwardPoints - nearLeg.forwardPoints;

    return { pair: pair.toUpperCase(), nearLeg, farLeg, swapPoints };
  }

  /**
   * Garman-Kohlhagen (GK) FX option pricing.
   * Extends BSM: treat base currency rate as continuous dividend yield.
   */
  priceOption(params: {
    pair: string;
    strike: number;
    tenorYears: number;
    volatility: number;
    optionType: 'call' | 'put';
    notional: number;
  }): FxOptionPricingResult {
    const { pair, strike, tenorYears: T, volatility: σ, optionType, notional } = params;
    const pairUpper = pair.toUpperCase();

    const spot = this.spotRates.get(pairUpper);
    if (!spot) throw new Error(`Unknown pair: ${pairUpper}`);

    const base = pairUpper.slice(0, 3);
    const quote = pairUpper.slice(3);
    const rd = this.riskFreeRates.get(quote) ?? 0.05;  // Domestic (quote) rate
    const rf = this.riskFreeRates.get(base) ?? 0.05;   // Foreign (base) rate

    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(spot / strike) + (rd - rf + 0.5 * σ * σ) * T) / (σ * sqrtT);
    const d2 = d1 - σ * sqrtT;

    const Nd1 = this.normCdf(d1);
    const Nd2 = this.normCdf(d2);

    // GK formula
    const eRfT = Math.exp(-rf * T);
    const eRdT = Math.exp(-rd * T);

    let price: number;
    let delta: number;

    if (optionType === 'call') {
      price = spot * eRfT * Nd1 - strike * eRdT * Nd2;
      delta = eRfT * Nd1;
    } else {
      price = strike * eRdT * (1 - Nd2) - spot * eRfT * (1 - Nd1);
      delta = -eRfT * (1 - Nd1);
    }

    const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    const vega = spot * eRfT * nd1 * sqrtT / 100;
    const gamma = (eRfT * nd1) / (spot * σ * sqrtT);

    const impliedForward = spot * Math.exp((rd - rf) * T);
    const deltaNeutralStrike = impliedForward * Math.exp(0.5 * σ * σ * T);

    return {
      price,
      pricePct: (price / spot) * 100,
      delta,
      vega,
      gamma,
      impliedForward,
      deltaNeutralStrike,
      pair: pairUpper,
    };
  }

  updateSpot(pair: string, rate: number): void {
    this.spotRates.set(pair.toUpperCase(), rate);
  }

  getSupportedPairs(): string[] {
    return Array.from(this.spotRates.keys());
  }

  private normCdf(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const y = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const result = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2) * y;
    return x > 0 ? result : 1 - result;
  }

  private getTypicalSpread(pair: string): number {
    const majorPairs = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD']);
    return majorPairs.has(pair) ? 0.8 : 2.5; // pips
  }

  private tenorToLabel(tenorYears: number): string {
    if (tenorYears < 0.03) return '1W';
    if (tenorYears <= 0.09) return '1M';
    if (tenorYears <= 0.17) return '2M';
    if (tenorYears <= 0.30) return '3M';
    if (tenorYears <= 0.55) return '6M';
    if (tenorYears <= 0.80) return '9M';
    if (tenorYears <= 1.1) return '1Y';
    if (tenorYears <= 2.1) return '2Y';
    return `${tenorYears.toFixed(1)}Y`;
  }
}
