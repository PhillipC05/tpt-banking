import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InstrumentType =
  | 'FIXED_RATE_LOAN'
  | 'FLOATING_RATE_LOAN'
  | 'FIXED_RATE_DEPOSIT'
  | 'FLOATING_RATE_DEPOSIT'
  | 'FIXED_RATE_BOND'
  | 'FLOATING_RATE_NOTE'
  | 'INTEREST_RATE_SWAP'
  | 'MORTGAGE'
  | 'CREDIT_FACILITY';

export type InterestRateShock =
  | 'PARALLEL_UP_200'       // +200 bps parallel shift
  | 'PARALLEL_DOWN_200'     // -200 bps parallel shift
  | 'STEEPENER'             // short rates -100bps, long rates +100bps
  | 'FLATTENER'             // short rates +100bps, long rates -100bps
  | 'SHORT_RATE_UP_300'     // short end up 300bps (Basel IRRBB shock)
  | 'SHORT_RATE_DOWN_300';

export interface RateSensitiveInstrument {
  id: string;
  type: InstrumentType;
  notional: number;
  bookValue: number;
  couponRate: number;         // current coupon/rate in decimal (e.g. 0.045 = 4.5%)
  repriceFrequency: number;   // in months (0 = fixed to maturity)
  maturityYears: number;
  nextRepriceYears: number;   // years until next repricing (0 if fixed)
  currency: string;
  isAsset: boolean;           // true = earning asset, false = liability
}

export interface RepricingGapBucket {
  label: string;
  daysStart: number;
  daysEnd: number;
  assetsRepricing: number;
  liabilitiesRepricing: number;
  gap: number;                // assets - liabilities
  cumulativeGap: number;
  niiImpact100bps: string;    // NII impact of 100bps rate change on this bucket
}

export interface DurationGap {
  portfolioDuration: number;           // Macaulay duration (years)
  portfolioModifiedDuration: number;   // Modified duration
  assetDuration: number;
  liabilityDuration: number;
  durationGap: number;                 // asset duration - liability duration
  economicValueOfEquity: number;       // EVE
  eveSensitivity200bps: string;        // EVE change for +200bps parallel shift
}

export interface NiiSensitivity {
  baseNii: string;
  scenarios: Array<{
    shock: InterestRateShock;
    niiChange: string;
    niiChangePercent: string;
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>;
}

export interface BasisRisk {
  exposurePair: string;           // e.g. "SOFR vs Prime"
  notionalMismatch: string;
  basisSpread: string;            // current basis spread in bps
  annualBasisRiskCost: string;
}

// ── IRRBB Basel time buckets ──────────────────────────────────────────────────

const REPRICING_BUCKETS = [
  { label: 'Overnight–1M',  daysStart: 0,    daysEnd: 30  },
  { label: '1M–3M',         daysStart: 30,   daysEnd: 90  },
  { label: '3M–6M',         daysStart: 90,   daysEnd: 180 },
  { label: '6M–1Y',         daysStart: 180,  daysEnd: 360 },
  { label: '1Y–2Y',         daysStart: 360,  daysEnd: 720 },
  { label: '2Y–3Y',         daysStart: 720,  daysEnd: 1080 },
  { label: '3Y–5Y',         daysStart: 1080, daysEnd: 1800 },
  { label: '5Y–10Y',        daysStart: 1800, daysEnd: 3650 },
  { label: '10Y–15Y',       daysStart: 3650, daysEnd: 5475 },
  { label: '15Y+',          daysStart: 5475, daysEnd: Infinity },
];

@Injectable()
export class InterestRateRiskService {

  // ── Repricing gap ─────────────────────────────────────────────────────────

  computeRepricingGap(instruments: RateSensitiveInstrument[]): RepricingGapBucket[] {
    const buckets = REPRICING_BUCKETS.map((b) => ({
      ...b,
      assetsRepricing: 0,
      liabilitiesRepricing: 0,
    }));

    for (const inst of instruments) {
      // Floating: reprices at next repricing date
      // Fixed: reprices at maturity
      const repriceYears = inst.repriceFrequency > 0
        ? inst.nextRepriceYears
        : inst.maturityYears;
      const repriceDays = Math.round(repriceYears * 365);

      const bucket = buckets.find((b) => repriceDays >= b.daysStart && repriceDays < b.daysEnd);
      if (!bucket) continue;

      if (inst.isAsset) bucket.assetsRepricing += inst.notional;
      else bucket.liabilitiesRepricing += inst.notional;
    }

    let cumulativeGap = 0;
    return buckets.map((b) => {
      const gap = b.assetsRepricing - b.liabilitiesRepricing;
      cumulativeGap += gap;
      // NII impact: gap × 100bps × fraction of year in bucket
      const yearFraction = (b.daysEnd === Infinity ? 365 : (b.daysEnd - b.daysStart)) / 365;
      const niiImpact = gap * 0.01 * yearFraction;
      return {
        label: b.label,
        daysStart: b.daysStart,
        daysEnd: b.daysEnd === Infinity ? 99999 : b.daysEnd,
        assetsRepricing: b.assetsRepricing,
        liabilitiesRepricing: b.liabilitiesRepricing,
        gap,
        cumulativeGap,
        niiImpact100bps: niiImpact.toFixed(0),
      };
    });
  }

  // ── NII sensitivity ───────────────────────────────────────────────────────

  computeNiiSensitivity(
    instruments: RateSensitiveInstrument[],
    horizon = 1,          // horizon in years for NII calculation
  ): NiiSensitivity {
    const baseNii = this.computeBaseNii(instruments, horizon);

    const shocks: Record<InterestRateShock, (matYears: number) => number> = {
      PARALLEL_UP_200:      () => 0.02,
      PARALLEL_DOWN_200:    () => -0.02,
      STEEPENER:            (y) => y < 2 ? -0.01 : 0.01,
      FLATTENER:            (y) => y < 2 ? 0.01 : -0.01,
      SHORT_RATE_UP_300:    (y) => y < 1 ? 0.03 : 0.0,
      SHORT_RATE_DOWN_300:  (y) => y < 1 ? -0.03 : 0.0,
    };

    const scenarios = (Object.keys(shocks) as InterestRateShock[]).map((shock) => {
      const stressedNii = this.computeBaseNii(
        instruments.map((inst) => {
          // Only floating instruments (or those repricing within horizon) are affected
          const repricesWithinHorizon = inst.repriceFrequency > 0 || inst.maturityYears <= horizon;
          if (!repricesWithinHorizon) return inst;
          const rateChange = shocks[shock](inst.maturityYears);
          return { ...inst, couponRate: Math.max(0, inst.couponRate + rateChange) };
        }),
        horizon,
      );

      const niiChange = stressedNii - baseNii;
      const niiChangePercent = baseNii !== 0 ? (niiChange / Math.abs(baseNii)) * 100 : 0;
      const absChangePct = Math.abs(niiChangePercent);

      return {
        shock,
        niiChange: niiChange.toFixed(0),
        niiChangePercent: `${niiChangePercent.toFixed(2)}%`,
        impactLevel: (
          absChangePct > 20 ? 'CRITICAL' :
          absChangePct > 10 ? 'HIGH' :
          absChangePct > 5  ? 'MEDIUM' :
          'LOW'
        ) as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      };
    });

    return { baseNii: baseNii.toFixed(0), scenarios };
  }

  private computeBaseNii(instruments: RateSensitiveInstrument[], horizon: number): number {
    return instruments.reduce((sum, inst) => {
      const income = inst.notional * inst.couponRate * Math.min(inst.maturityYears, horizon);
      return sum + (inst.isAsset ? income : -income);
    }, 0);
  }

  // ── Duration & EVE ────────────────────────────────────────────────────────

  computeDurationGap(instruments: RateSensitiveInstrument[], marketRate = 0.05): DurationGap {
    let assetPv = 0, assetDurWeighted = 0;
    let liabilityPv = 0, liabilityDurWeighted = 0;

    for (const inst of instruments) {
      const pv = this.computePresentValue(inst, marketRate);
      const macaulay = this.computeMacaulayDuration(inst, marketRate);

      if (inst.isAsset) {
        assetPv += pv;
        assetDurWeighted += pv * macaulay;
      } else {
        liabilityPv += pv;
        liabilityDurWeighted += pv * macaulay;
      }
    }

    const assetDuration = assetPv > 0 ? assetDurWeighted / assetPv : 0;
    const liabilityDuration = liabilityPv > 0 ? liabilityDurWeighted / liabilityPv : 0;
    const eve = assetPv - liabilityPv;
    const durationGap = assetDuration - (liabilityPv / assetPv) * liabilityDuration;

    // EVE sensitivity to +200bps: ΔEVE ≈ -Duration_gap × EVE × Δrate
    const eveSensitivity200 = -durationGap * eve * 0.02;

    return {
      portfolioDuration: durationGap,
      portfolioModifiedDuration: durationGap / (1 + marketRate),
      assetDuration,
      liabilityDuration,
      durationGap,
      economicValueOfEquity: eve,
      eveSensitivity200bps: eveSensitivity200.toFixed(0),
    };
  }

  private computePresentValue(inst: RateSensitiveInstrument, discountRate: number): number {
    if (inst.maturityYears <= 0) return inst.bookValue;
    const n = Math.max(1, Math.round(inst.maturityYears));
    const c = inst.couponRate * inst.notional;
    let pv = 0;
    for (let t = 1; t <= n; t++) {
      pv += c / Math.pow(1 + discountRate, t);
    }
    pv += inst.notional / Math.pow(1 + discountRate, n);
    return pv;
  }

  private computeMacaulayDuration(inst: RateSensitiveInstrument, discountRate: number): number {
    if (inst.maturityYears <= 0) return 0;
    const n = Math.max(1, Math.round(inst.maturityYears));
    const c = inst.couponRate * inst.notional;
    let weightedTime = 0;
    let pv = 0;
    for (let t = 1; t <= n; t++) {
      const pvt = c / Math.pow(1 + discountRate, t);
      weightedTime += t * pvt;
      pv += pvt;
    }
    const pvPrincipal = inst.notional / Math.pow(1 + discountRate, n);
    weightedTime += n * pvPrincipal;
    pv += pvPrincipal;
    return pv > 0 ? weightedTime / pv : 0;
  }

  // ── Basis risk ────────────────────────────────────────────────────────────

  assessBasisRisk(positions: Array<{
    referenceRate: string;     // e.g. "SOFR", "Prime", "EURIBOR"
    notional: number;
    isAsset: boolean;
    currentRate: number;
  }>): BasisRisk[] {
    const byRate = new Map<string, { assetNotional: number; liabilityNotional: number; rate: number }>();

    for (const pos of positions) {
      const existing = byRate.get(pos.referenceRate) ?? { assetNotional: 0, liabilityNotional: 0, rate: pos.currentRate };
      if (pos.isAsset) existing.assetNotional += pos.notional;
      else existing.liabilityNotional += pos.notional;
      byRate.set(pos.referenceRate, existing);
    }

    const rates = [...byRate.entries()];
    const result: BasisRisk[] = [];

    for (let i = 0; i < rates.length; i++) {
      for (let j = i + 1; j < rates.length; j++) {
        const [rateA, dataA] = rates[i]!;
        const [rateB, dataB] = rates[j]!;
        const mismatch = Math.abs(dataA.assetNotional - dataB.liabilityNotional);
        const basisSpread = Math.abs(dataA.rate - dataB.rate) * 10000; // in bps
        const annualCost = mismatch * Math.abs(dataA.rate - dataB.rate);

        result.push({
          exposurePair: `${rateA} vs ${rateB}`,
          notionalMismatch: mismatch.toFixed(0),
          basisSpread: `${basisSpread.toFixed(2)} bps`,
          annualBasisRiskCost: annualCost.toFixed(0),
        });
      }
    }

    return result;
  }
}
