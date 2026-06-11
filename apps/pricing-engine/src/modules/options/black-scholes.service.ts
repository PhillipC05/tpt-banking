import { Injectable, Logger } from '@nestjs/common';
import { normCdf, normPdf, discountFactor } from '../../lib/statistics';

export interface OptionGreeks {
  delta: number;   // dV/dS — rate of change of option price w.r.t. underlying
  gamma: number;   // d²V/dS² — rate of change of delta w.r.t. underlying
  vega: number;    // dV/dσ — sensitivity to volatility (per 1% change)
  theta: number;   // dV/dt — time decay per calendar day
  rho: number;     // dV/dr — sensitivity to interest rate (per 1% change)
  vanna: number;   // d²V/dSdσ — cross sensitivity (delta to vol)
  volga: number;   // d²V/dσ² — sensitivity of vega to vol
}

export interface OptionPricingResult {
  price: number;
  intrinsicValue: number;
  timeValue: number;
  greeks: OptionGreeks;
  d1: number;
  d2: number;
  impliedForward: number;
}

export interface BlackScholesParams {
  /** Underlying spot price */
  spot: number;
  /** Strike price */
  strike: number;
  /** Annualised risk-free rate (e.g. 0.05 = 5%) */
  riskFreeRate: number;
  /** Annualised dividend / convenience yield */
  dividendYield: number;
  /** Annualised volatility (e.g. 0.20 = 20%) */
  volatility: number;
  /** Time to expiry in years */
  timeToExpiry: number;
  /** 'call' | 'put' */
  optionType: 'call' | 'put';
}

/**
 * Black-Scholes-Merton options pricing service.
 *
 * Implements the closed-form BSM formula for European vanilla options.
 * Computes full Greeks: Delta, Gamma, Vega, Theta, Rho, Vanna, Volga.
 *
 * Reference: Black, F.; Scholes, M. (1973). "The Pricing of Options and Corporate Liabilities".
 */
@Injectable()
export class BlackScholesService {
  private readonly logger = new Logger(BlackScholesService.name);

  price(params: BlackScholesParams): OptionPricingResult {
    const { spot: S, strike: K, riskFreeRate: r, dividendYield: q, volatility: σ, timeToExpiry: T } = params;
    const isCall = params.optionType === 'call';

    // Handle expiry edge case
    if (T <= 0) {
      const intrinsic = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
      return this.zeroTimeResult(intrinsic, isCall, S, K);
    }

    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * σ * σ) * T) / (σ * sqrtT);
    const d2 = d1 - σ * sqrtT;

    const df = discountFactor(r, T);   // e^(-rT)
    const qdf = discountFactor(q, T);  // e^(-qT)

    const Nd1 = normCdf(d1);
    const Nd2 = normCdf(d2);
    const Nnd1 = normCdf(-d1);
    const Nnd2 = normCdf(-d2);
    const nd1 = normPdf(d1);

    let price: number;
    if (isCall) {
      price = S * qdf * Nd1 - K * df * Nd2;
    } else {
      price = K * df * Nnd2 - S * qdf * Nnd1;
    }

    const intrinsicValue = Math.max(isCall ? S - K : K - S, 0);
    const timeValue = Math.max(price - intrinsicValue, 0);

    const greeks = this.calculateGreeks({ S, K, r, q, σ, T, d1, d2, nd1, df, qdf, isCall });
    const impliedForward = S * Math.exp((r - q) * T);

    return { price, intrinsicValue, timeValue, greeks, d1, d2, impliedForward };
  }

  /**
   * Calculates implied volatility from a market option price using Newton-Raphson.
   * @param marketPrice - Observed market price of the option
   * @param params - Option parameters (excluding volatility)
   */
  impliedVolatility(
    marketPrice: number,
    params: Omit<BlackScholesParams, 'volatility'>,
    tolerance = 1e-6,
    maxIterations = 100,
  ): number {
    // Initial guess using Brenner-Subrahmanyam approximation
    let σ = Math.sqrt(2 * Math.PI / params.timeToExpiry) * (marketPrice / params.spot);
    σ = Math.max(0.001, Math.min(σ, 5.0)); // Clamp to [0.1%, 500%]

    for (let i = 0; i < maxIterations; i++) {
      const result = this.price({ ...params, volatility: σ });
      const diff = result.price - marketPrice;

      if (Math.abs(diff) < tolerance) return σ;

      const vega = result.greeks.vega / 100; // Convert back from per-1%
      if (Math.abs(vega) < 1e-10) break;

      σ = σ - diff / vega;
      σ = Math.max(0.001, Math.min(σ, 5.0));
    }

    this.logger.warn(`Implied volatility did not converge after ${maxIterations} iterations`);
    return σ;
  }

  /**
   * Price an array of options efficiently (e.g. entire options chain).
   */
  priceChain(
    strikes: number[],
    baseParams: Omit<BlackScholesParams, 'strike'>,
  ): OptionPricingResult[] {
    return strikes.map((strike) => this.price({ ...baseParams, strike }));
  }

  private calculateGreeks(params: {
    S: number; K: number; r: number; q: number; σ: number; T: number;
    d1: number; d2: number; nd1: number; df: number; qdf: number; isCall: boolean;
  }): OptionGreeks {
    const { S, K, r, q, σ, T, d1, d2, nd1, df, qdf, isCall } = params;
    const sqrtT = Math.sqrt(T);
    const sign = isCall ? 1 : -1;

    // Delta: dV/dS
    const delta = isCall
      ? qdf * normCdf(d1)
      : -qdf * normCdf(-d1);

    // Gamma: d²V/dS² (same for calls and puts)
    const gamma = (qdf * nd1) / (S * σ * sqrtT);

    // Vega: dV/dσ — expressed per 1% move in vol
    const vega = (S * qdf * nd1 * sqrtT) / 100;

    // Theta: dV/dt — per calendar day (1/365)
    const theta = (
      -(S * qdf * nd1 * σ) / (2 * sqrtT)
      - sign * r * K * df * normCdf(sign * d2)
      + sign * q * S * qdf * normCdf(sign * d1)
    ) / 365;

    // Rho: dV/dr — per 1% change in rate
    const rho = sign * K * T * df * normCdf(sign * d2) / 100;

    // Vanna: d²V/dSdσ
    const vanna = -qdf * nd1 * d2 / σ;

    // Volga (Vomma): d²V/dσ²
    const volga = vega * 100 * d1 * d2 / σ;

    return { delta, gamma, vega, theta, rho, vanna, volga };
  }

  private zeroTimeResult(
    intrinsic: number,
    isCall: boolean,
    S: number,
    K: number,
  ): OptionPricingResult {
    return {
      price: intrinsic,
      intrinsicValue: intrinsic,
      timeValue: 0,
      greeks: {
        delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
        gamma: 0, vega: 0, theta: 0, rho: 0, vanna: 0, volga: 0,
      },
      d1: 0,
      d2: 0,
      impliedForward: S,
    };
  }
}
