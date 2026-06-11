import { Injectable, Logger } from '@nestjs/common';
import { cubicSpline, lerp, discountFactor } from '../../lib/statistics';

export interface CurvePoint {
  /** Tenor in years (e.g. 0.5, 1, 2, 5, 10, 30) */
  tenor: number;
  /** Zero rate (continuous compounding) */
  zeroRate: number;
}

export interface YieldCurve {
  name: string;
  currency: string;
  asOf: Date;
  points: CurvePoint[];
}

export interface SwapRateInput {
  tenor: number;   // Years
  rate: number;    // Par swap rate (e.g. 0.035 = 3.5%)
  frequency: number; // Coupon payments per year (1=annual, 2=semi-annual, 4=quarterly)
}

export interface ForwardRateResult {
  startTenor: number;
  endTenor: number;
  forwardRate: number;
  discountStart: number;
  discountEnd: number;
}

export interface SpotRateResult {
  tenor: number;
  zeroRate: number;
  discountFactor: number;
}

/**
 * Yield Curve construction and interpolation service.
 *
 * Methods:
 *   1. Bootstrap from swap rates — extracts zero rates from par swap curve
 *   2. Flat curve — for simple scenarios
 *   3. Interpolation — zero rate and discount factor at any tenor
 *   4. Forward rates — implied forward rates between any two tenors
 *   5. Par rates — recover par rates from the zero curve
 *
 * Interpolation: log-linear on discount factors (industry standard).
 */
@Injectable()
export class YieldCurveService {
  private readonly logger = new Logger(YieldCurveService.name);

  /**
   * Bootstrap zero rates from par swap rates.
   * Uses the standard bootstrapping algorithm:
   * df(T) = (1 - c*Σdf(ti)) / (1 + c*dt) for annual coupons
   */
  bootstrapFromSwapRates(
    swapRates: SwapRateInput[],
    currency = 'USD',
    name = 'LIBOR/SOFR',
  ): YieldCurve {
    // Sort by tenor
    const sorted = [...swapRates].sort((a, b) => a.tenor - b.tenor);
    const points: CurvePoint[] = [];
    const dfCache = new Map<number, number>();

    for (const swap of sorted) {
      const dt = 1 / swap.frequency;
      const tenors: number[] = [];
      let t = dt;
      while (t <= swap.tenor - dt / 2) {
        tenors.push(t);
        t += dt;
      }
      tenors.push(swap.tenor);

      // Sum discount factors for intermediate cash flows
      let sumDf = 0;
      for (const t of tenors.slice(0, -1)) {
        // Interpolate discount factor for intermediate tenors
        const df = this.interpolateDiscountFactor(points, t);
        dfCache.set(t, df);
        sumDf += df * swap.rate * dt;
      }

      // Solve for the final discount factor
      const finalDf = (1 - sumDf) / (1 + swap.rate * dt);
      dfCache.set(swap.tenor, finalDf);

      // Convert to zero rate (continuous compounding)
      const zeroRate = -Math.log(finalDf) / swap.tenor;
      points.push({ tenor: swap.tenor, zeroRate });
    }

    // Add overnight rate if needed (assume first swap point)
    if (points.length > 0 && points[0].tenor > 0.1) {
      points.unshift({ tenor: 0.0001, zeroRate: points[0].zeroRate });
    }

    points.sort((a, b) => a.tenor - b.tenor);

    return { name, currency, asOf: new Date(), points };
  }

  /**
   * Build a flat yield curve (same rate for all tenors).
   */
  buildFlat(rate: number, currency = 'USD'): YieldCurve {
    return {
      name: 'FLAT',
      currency,
      asOf: new Date(),
      points: [
        { tenor: 0.0001, zeroRate: rate },
        { tenor: 0.25, zeroRate: rate },
        { tenor: 0.5, zeroRate: rate },
        { tenor: 1, zeroRate: rate },
        { tenor: 2, zeroRate: rate },
        { tenor: 5, zeroRate: rate },
        { tenor: 10, zeroRate: rate },
        { tenor: 30, zeroRate: rate },
      ],
    };
  }

  /**
   * Get zero rate at any tenor by interpolation.
   */
  getZeroRate(curve: YieldCurve, tenor: number): number {
    const { points } = curve;
    if (points.length === 0) throw new Error('Curve has no points');
    if (tenor <= points[0].tenor) return points[0].zeroRate;
    if (tenor >= points[points.length - 1].tenor) return points[points.length - 1].zeroRate;

    let i = 0;
    while (i < points.length - 1 && points[i + 1].tenor < tenor) i++;

    return lerp(
      points[i].tenor, points[i].zeroRate,
      points[i + 1].tenor, points[i + 1].zeroRate,
      tenor,
    );
  }

  /**
   * Get discount factor at any tenor.
   * Uses log-linear interpolation on discount factors.
   */
  getDiscountFactor(curve: YieldCurve, tenor: number): number {
    const r = this.getZeroRate(curve, tenor);
    return discountFactor(r, tenor);
  }

  /**
   * Compute implied forward rate between two tenors.
   * f(T1, T2) = [ln(df(T1)) - ln(df(T2))] / (T2 - T1)
   */
  getForwardRate(curve: YieldCurve, startTenor: number, endTenor: number): ForwardRateResult {
    if (endTenor <= startTenor) {
      throw new Error('endTenor must be greater than startTenor');
    }

    const df1 = this.getDiscountFactor(curve, startTenor);
    const df2 = this.getDiscountFactor(curve, endTenor);
    const forwardRate = (Math.log(df1) - Math.log(df2)) / (endTenor - startTenor);

    return {
      startTenor,
      endTenor,
      forwardRate,
      discountStart: df1,
      discountEnd: df2,
    };
  }

  /**
   * Get the full zero curve as a series of SpotRateResult points.
   */
  getSpotRates(curve: YieldCurve): SpotRateResult[] {
    return curve.points.map((p) => ({
      tenor: p.tenor,
      zeroRate: p.zeroRate,
      discountFactor: discountFactor(p.zeroRate, p.tenor),
    }));
  }

  /**
   * Compute par rate (coupon rate that makes a bond trade at par) at a given tenor.
   */
  getParRate(curve: YieldCurve, tenor: number, frequency = 2): number {
    const dt = 1 / frequency;
    const tenors: number[] = [];
    let t = dt;
    while (t <= tenor) {
      tenors.push(t);
      t += dt;
    }

    const sumDf = tenors.reduce((s, t) => s + this.getDiscountFactor(curve, t), 0);
    const dfFinal = this.getDiscountFactor(curve, tenor);

    return (1 - dfFinal) / (sumDf * dt);
  }

  /**
   * Interpolate discount factor for a tenor not yet in the curve.
   * Used during bootstrapping for intermediate tenors.
   */
  private interpolateDiscountFactor(points: CurvePoint[], tenor: number): number {
    if (points.length === 0) return 1.0;

    const sorted = [...points].sort((a, b) => a.tenor - b.tenor);
    if (tenor <= sorted[0].tenor) {
      return discountFactor(sorted[0].zeroRate, tenor);
    }
    if (tenor >= sorted[sorted.length - 1].tenor) {
      return discountFactor(sorted[sorted.length - 1].zeroRate, tenor);
    }

    let i = 0;
    while (i < sorted.length - 1 && sorted[i + 1].tenor < tenor) i++;

    const zeroRate = lerp(
      sorted[i].tenor, sorted[i].zeroRate,
      sorted[i + 1].tenor, sorted[i + 1].zeroRate,
      tenor,
    );
    return discountFactor(zeroRate, tenor);
  }
}
