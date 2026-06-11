import { Injectable } from '@nestjs/common';
import { normCdf, discountFactor, boxMuller } from '../../lib/statistics';

// ── Input types ───────────────────────────────────────────────────────────────

export interface ExposureProfile {
  /** Time in years */
  time: number;
  /** Expected Exposure (EE) at this time point */
  expectedExposure: number;
}

export interface CvaParams {
  /** Counterparty CDS spread (annualised, e.g. 0.0150 = 150bps) */
  cdsSpreads: number;
  /** Recovery rate (e.g. 0.40 = 40%) */
  recoveryRate: number;
  /** Expected Exposure profile over trade lifetime */
  exposureProfile: ExposureProfile[];
  /** Risk-free discount curve (array of {time, rate} pairs) */
  discountCurve: Array<{ time: number; rate: number }>;
}

export interface BilatCvaParams extends CvaParams {
  /** Own CDS spread (for DVA calculation) */
  ownCdsSpread: number;
  /** Own recovery rate */
  ownRecoveryRate: number;
  /** Own exposure profile (negative EE from counterparty's view) */
  ownExposureProfile: ExposureProfile[];
}

export interface MonteCarloCvaParams {
  /** IRS / swap notional */
  notional: number;
  /** Fixed rate of the IRS */
  fixedRate: number;
  /** Current market rate */
  marketRate: number;
  /** Rate volatility (annualised) */
  rateVolatility: number;
  /** Maturity in years */
  maturityYears: number;
  /** Payment frequency per year */
  frequency: number;
  cdsSpreads: number;
  recoveryRate: number;
  riskFreeRate: number;
  numSimulations?: number;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface CvaResult {
  /** Unilateral CVA (cost to us from counterparty default) */
  cva: number;
  cvaBps: number;
  pvPremiumLeg: number;
  pvProtectionLeg: number;
  hazardRate: number;
  peakExposure: number;
  averageExposure: number;
  effectiveMaturity: number;
  exposureProfile: ExposureProfile[];
}

export interface BilatCvaResult extends CvaResult {
  /** DVA: value to us from our own default risk */
  dva: number;
  dvaBps: number;
  /** Bilateral CVA = CVA - DVA */
  bilateralCva: number;
  bilateralCvaBps: number;
  /** FVA component (simplified) */
  fva: number;
}

export interface MonteCarloCvaResult {
  cva: number;
  cvaBps: number;
  expectedPositiveExposure: number;
  peakExposure: number;
  simulationCount: number;
  confidenceInterval: { lower: number; upper: number };
}

/**
 * Credit Valuation Adjustment (CVA) service.
 *
 * Implements three approaches:
 *  1. Analytical CVA — semi-analytical using discretised exposure profile + ISDA hazard rate
 *  2. Bilateral CVA — CVA - DVA using both counterparty and own credit
 *  3. Monte Carlo CVA — simulate IRS mark-to-market paths, compute EPE numerically
 *
 * CVA = (1 - R) × ∑ EE(tᵢ) × ΔPD(tᵢ) × DF(tᵢ)
 * where ΔPD(tᵢ) = Q(tᵢ₋₁) - Q(tᵢ) = default probability in [tᵢ₋₁, tᵢ]
 *       Q(t)   = survival probability = exp(-λt)
 *       λ      = hazard rate ≈ spread / (1 - R)
 */
@Injectable()
export class CvaService {

  // ── Analytical CVA ────────────────────────────────────────────────────────

  computeCva(params: CvaParams): CvaResult {
    const { cdsSpreads, recoveryRate, exposureProfile, discountCurve } = params;
    const lgd = 1 - recoveryRate;

    // Implied hazard rate from CDS spread
    const hazardRate = cdsSpreads / lgd;

    // Sort profile by time
    const profile = [...exposureProfile].sort((a, b) => a.time - b.time);

    let cva = 0;
    let pvPremiumLeg = 0;
    let pvProtectionLeg = 0;

    for (let i = 0; i < profile.length; i++) {
      const t = profile[i].time;
      const tPrev = i === 0 ? 0 : profile[i - 1].time;
      const ee = profile[i].expectedExposure;

      const q0 = Math.exp(-hazardRate * tPrev);
      const q1 = Math.exp(-hazardRate * t);
      const defaultProb = q0 - q1;          // marginal default probability
      const survivalMid = Math.exp(-hazardRate * (tPrev + t) / 2);
      const df = this.interpolateRate(discountCurve, t);

      const pvContrib = lgd * ee * defaultProb * df;
      cva += pvContrib;
      pvProtectionLeg += pvContrib;

      // Premium leg (spread × EE × survival × DF × Δt)
      pvPremiumLeg += cdsSpreads * ee * survivalMid * df * (t - tPrev);
    }

    const maxT = profile[profile.length - 1].time;
    const peakEE = Math.max(...profile.map((p) => p.expectedExposure));
    const avgEE = profile.reduce((s, p) => s + p.expectedExposure, 0) / profile.length;

    return {
      cva,
      cvaBps: (cva / (params.exposureProfile[0]?.expectedExposure || 1)) * 10000,
      pvPremiumLeg,
      pvProtectionLeg,
      hazardRate,
      peakExposure: peakEE,
      averageExposure: avgEE,
      effectiveMaturity: maxT,
      exposureProfile: profile,
    };
  }

  // ── Bilateral CVA (CVA - DVA) ─────────────────────────────────────────────

  computeBilateralCva(params: BilatCvaParams): BilatCvaResult {
    const cvaResult = this.computeCva(params);

    // DVA: symmetric — value from our own potential default
    const dvaParams: CvaParams = {
      cdsSpreads: params.ownCdsSpread,
      recoveryRate: params.ownRecoveryRate,
      exposureProfile: params.ownExposureProfile,
      discountCurve: params.discountCurve,
    };
    const dvaResult = this.computeCva(dvaParams);

    const dva = dvaResult.cva;
    const bilateralCva = cvaResult.cva - dva;

    // Simplified FVA: funding cost on uncollateralised exposure
    // FVA ≈ (funding spread / 2) × EPE × effective maturity
    const fundingSpread = 0.005; // 50bps typical unsecured funding spread
    const fva = fundingSpread * cvaResult.averageExposure * cvaResult.effectiveMaturity;

    const baseNotional = params.exposureProfile[0]?.expectedExposure || 1;

    return {
      ...cvaResult,
      dva,
      dvaBps: (dva / baseNotional) * 10000,
      bilateralCva,
      bilateralCvaBps: (bilateralCva / baseNotional) * 10000,
      fva,
    };
  }

  // ── Monte Carlo CVA for Interest Rate Swap ────────────────────────────────

  computeMonteCarloCva(params: MonteCarloCvaParams): MonteCarloCvaResult {
    const {
      notional, fixedRate, marketRate, rateVolatility: σ,
      maturityYears: T, frequency, cdsSpreads, recoveryRate,
      riskFreeRate: r, numSimulations: N = 5_000,
    } = params;

    const lgd = 1 - recoveryRate;
    const hazardRate = cdsSpreads / lgd;
    const dt = 1 / frequency;

    // Build payment schedule
    const paymentTimes: number[] = [];
    for (let t = dt; t <= T + dt / 2; t += dt) paymentTimes.push(Math.min(t, T));

    const exposures: number[] = new Array(paymentTimes.length).fill(0);
    let cvaSum = 0;
    let cvaSquaredSum = 0;

    for (let sim = 0; sim < N; sim++) {
      // Simulate rate path (Hull-White / Normal model: dr = σ*dW)
      let rate = marketRate;
      let pathCva = 0;

      for (let i = 0; i < paymentTimes.length; i++) {
        const t = paymentTimes[i];
        const tPrev = i === 0 ? 0 : paymentTimes[i - 1];
        const sqrtDt = Math.sqrt(t - tPrev);

        const [z] = boxMuller();
        rate = Math.max(rate + σ * sqrtDt * z, -0.05); // floor at -5%

        // Approximate IRS MTM: NPV of remaining fixed-float cashflows
        const remainingT = T - t;
        const mtm = this.approximateIrsMtm(notional, fixedRate, rate, remainingT, frequency, r);
        const ee = Math.max(mtm, 0);
        exposures[i] += ee;

        // CVA contribution
        const q0 = Math.exp(-hazardRate * tPrev);
        const q1 = Math.exp(-hazardRate * t);
        const defaultProb = q0 - q1;
        const df = discountFactor(r, t);
        pathCva += lgd * ee * defaultProb * df;
      }

      cvaSum += pathCva;
      cvaSquaredSum += pathCva * pathCva;
    }

    const cva = cvaSum / N;
    const variance = (cvaSquaredSum / N) - cva * cva;
    const stderr = Math.sqrt(variance / N);
    const z95 = 1.96;

    const avgExposures = exposures.map((e) => e / N);
    const peakExposure = Math.max(...avgExposures);
    const epe = avgExposures.reduce((s, e) => s + e, 0) / avgExposures.length;

    return {
      cva,
      cvaBps: notional > 0 ? (cva / notional) * 10000 : 0,
      expectedPositiveExposure: epe,
      peakExposure,
      simulationCount: N,
      confidenceInterval: {
        lower: Math.max(0, cva - z95 * stderr),
        upper: cva + z95 * stderr,
      },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private approximateIrsMtm(
    notional: number,
    fixedRate: number,
    currentRate: number,
    remainingT: number,
    frequency: number,
    discountRate: number,
  ): number {
    if (remainingT <= 0) return 0;
    const dt = 1 / frequency;
    const numPayments = Math.round(remainingT * frequency);
    let pvFixed = 0, pvFloat = 0;

    for (let k = 1; k <= numPayments; k++) {
      const t = k * dt;
      const df = discountFactor(discountRate, t);
      pvFixed += notional * fixedRate * dt * df;
      pvFloat += notional * currentRate * dt * df;
    }
    // Principal exchange at maturity (for swap valuation)
    const dfT = discountFactor(discountRate, remainingT);
    pvFixed += notional * dfT;
    pvFloat += notional * dfT;

    return pvFloat - pvFixed; // pay-fixed receiver = positive when rates rise
  }

  private interpolateRate(curve: Array<{ time: number; rate: number }>, t: number): number {
    if (curve.length === 0) return 1;
    if (t <= curve[0].time) return discountFactor(curve[0].rate, t);
    if (t >= curve[curve.length - 1].time) return discountFactor(curve[curve.length - 1].rate, t);
    const i = curve.findIndex((p) => p.time >= t);
    const p0 = curve[i - 1], p1 = curve[i];
    const w = (t - p0.time) / (p1.time - p0.time);
    const rate = p0.rate + w * (p1.rate - p0.rate);
    return discountFactor(rate, t);
  }
}
