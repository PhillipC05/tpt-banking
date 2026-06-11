import { Injectable, Logger } from '@nestjs/common';
import { YieldCurveService, YieldCurve } from '../yield-curve/yield-curve.service';
import { discountFactor } from '../../lib/statistics';

export interface CdsParams {
  /** Notional principal */
  notional: number;
  /** CDS spread in decimal (e.g. 0.0150 = 150bps) */
  spread: number;
  /** Maturity in years */
  maturityYears: number;
  /** Recovery rate (e.g. 0.40 = 40%) */
  recoveryRate: number;
  /** Coupon payment frequency per year (typically 4 = quarterly) */
  frequency: number;
  /** Discount / risk-free curve */
  discountCurve: YieldCurve;
}

export interface CdsValuation {
  /** NPV from protection buyer's perspective */
  npv: number;
  /** PV of premium leg */
  pvPremiumLeg: number;
  /** PV of protection leg */
  pvProtectionLeg: number;
  /** Par CDS spread (spread that makes NPV = 0) */
  parSpread: number;
  /** Credit DV01 — sensitivity to 1bp spread change */
  creditDv01: number;
  /** Upfront payment (standard ISDA model) */
  upfront: number;
  /** Implied hazard rate (constant, from market spread) */
  hazardRate: number;
  premiumCashFlows: Array<{ date: number; coupon: number; survivalProb: number; pv: number }>;
}

/**
 * Credit Default Swap (CDS) pricing service.
 *
 * Uses the ISDA standard model:
 *   1. Extract constant hazard rate from market spread
 *   2. PV(Protection Leg) = N*(1-R)*∫h*Q(t)*df(t)dt  ≈ discrete sum
 *   3. PV(Premium Leg)   = N*s*Σ(Δt*Q(ti)*df(ti))
 *
 * where Q(t) = survival probability = exp(-h*t)
 *       h    = hazard rate
 *       R    = recovery rate
 *       df   = risk-free discount factor
 */
@Injectable()
export class CdsPricingService {
  private readonly logger = new Logger(CdsPricingService.name);

  constructor(private readonly yieldCurveService: YieldCurveService) {}

  price(params: CdsParams): CdsValuation {
    const { notional, spread, maturityYears, recoveryRate, frequency, discountCurve } = params;

    const LGD = 1 - recoveryRate;
    const dt = 1 / frequency;

    // Extract hazard rate from spread: h ≈ spread / (1 - R)
    const hazardRate = spread / LGD;

    // Build tenor schedule
    const tenors: number[] = [];
    let t = dt;
    while (t <= maturityYears + dt / 2) {
      tenors.push(Math.min(t, maturityYears));
      if (t >= maturityYears) break;
      t += dt;
    }

    // ── Premium Leg ───────────────────────────────────────────────────────────
    const premiumCashFlows = tenors.map((tenor) => {
      const survivalProb = Math.exp(-hazardRate * tenor);
      const df = this.yieldCurveService.getDiscountFactor(discountCurve, tenor);
      const coupon = notional * spread * dt;
      const pv = coupon * survivalProb * df;
      return { date: tenor, coupon, survivalProb, pv };
    });

    const pvPremiumLeg = premiumCashFlows.reduce((s, cf) => s + cf.pv, 0);

    // ── Protection Leg ────────────────────────────────────────────────────────
    // Approximate: sum over midpoints of each period
    let pvProtectionLeg = 0;
    for (let i = 0; i < tenors.length; i++) {
      const t0 = i === 0 ? 0 : tenors[i - 1];
      const t1 = tenors[i];
      const tMid = (t0 + t1) / 2;
      const survivalMid = Math.exp(-hazardRate * tMid);
      const defaultProb = (Math.exp(-hazardRate * t0) - Math.exp(-hazardRate * t1));
      const df = this.yieldCurveService.getDiscountFactor(discountCurve, tMid);
      pvProtectionLeg += notional * LGD * defaultProb * df;
    }

    // ── NPV (protection buyer pays premium, receives protection) ─────────────
    const npv = pvProtectionLeg - pvPremiumLeg;

    // ── Par Spread ────────────────────────────────────────────────────────────
    const annuityFactor = premiumCashFlows.reduce(
      (s, cf) => s + cf.survivalProb * cf.discountFactor * dt, 0,
    );
    const parSpread = pvProtectionLeg / (notional * annuityFactor);

    // ── Credit DV01 ───────────────────────────────────────────────────────────
    const bumpedParams = { ...params, spread: spread + 0.0001 };
    const bumpedResult = this.price(bumpedParams);
    const creditDv01 = (bumpedResult.pvPremiumLeg - pvPremiumLeg);

    // ── Upfront (ISDA standard: coupon is 100bps or 500bps, upfront adjusts) ─
    const standardCoupon = spread >= 0.03 ? 0.05 : 0.01;
    const upfrontParams = { ...params, spread: standardCoupon };
    const upfrontResult = this.price(upfrontParams);
    const upfront = pvProtectionLeg - upfrontResult.pvPremiumLeg;

    return {
      npv,
      pvPremiumLeg,
      pvProtectionLeg,
      parSpread,
      creditDv01,
      upfront,
      hazardRate,
      premiumCashFlows: premiumCashFlows.map((cf) => ({
        ...cf,
        discountFactor: this.yieldCurveService.getDiscountFactor(discountCurve, cf.date),
      })),
    };
  }
}
