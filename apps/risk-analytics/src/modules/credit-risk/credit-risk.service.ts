import { Injectable } from '@nestjs/common';
import { normCdf } from '../../lib/statistics';

// ── Input types ───────────────────────────────────────────────────────────────

export interface AltmanZScoreParams {
  /** Working capital (current assets - current liabilities) */
  workingCapital: number;
  /** Total assets */
  totalAssets: number;
  /** Retained earnings */
  retainedEarnings: number;
  /** EBIT (Earnings before interest and taxes) */
  ebit: number;
  /** Market value of equity */
  marketValueEquity: number;
  /** Book value of total liabilities */
  bookValueLiabilities: number;
  /** Net sales / revenues */
  netSales: number;
  /** Entity type affects model variant */
  entityType: 'public' | 'private' | 'nonManufacturing';
}

export interface MertonModelParams {
  /** Current equity market cap */
  equityValue: number;
  /** Equity volatility (annualised) */
  equityVolatility: number;
  /** Face value of debt (book value of liabilities) */
  debtFaceValue: number;
  /** Risk-free rate */
  riskFreeRate: number;
  /** Debt maturity in years */
  debtMaturityYears: number;
}

export interface CreditScorecardParams {
  /** PD from credit scoring model (0–1) */
  probabilityOfDefault: number;
  /** LGD: fraction of exposure lost on default (0–1) */
  lossGivenDefault: number;
  /** EAD: gross exposure at default */
  exposureAtDefault: number;
  /** Maturity for regulatory capital (1–5 years) */
  maturityYears?: number;
}

export interface RetailCreditParams {
  /** FICO / credit score (300–850) */
  creditScore: number;
  /** Debt-to-income ratio (0–1) */
  debtToIncome: number;
  /** Loan-to-value ratio (0–1, for secured loans) */
  loanToValue?: number;
  /** Months since most recent delinquency (null = never) */
  monthsSinceDelinquency?: number;
  /** Number of recent credit inquiries */
  recentInquiries?: number;
  /** Product type — affects base PD assumption */
  productType: 'mortgage' | 'auto' | 'personal' | 'creditCard' | 'business';
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface AltmanZResult {
  zScore: number;
  rating: string;
  probabilityOfDefault: number;
  riskCategory: 'SAFE' | 'GREY' | 'DISTRESS';
  ratioBreakdown: {
    x1_workingCapital: number;
    x2_retainedEarnings: number;
    x3_ebit: number;
    x4_equityToDebt: number;
    x5_salesTurnover: number;
  };
  interpretation: string;
}

export interface MertonResult {
  assetValue: number;
  assetVolatility: number;
  distanceToDefault: number;
  probabilityOfDefault: number;
  riskNeutralPD: number;
  impliedCreditSpread: number;
  creditRating: string;
}

export interface ExpectedLossResult {
  expectedLoss: number;
  unexpectedLoss: number;
  economicCapital: number;
  probabilityOfDefault: number;
  lossGivenDefault: number;
  exposureAtDefault: number;
  riskWeightedAssets?: number;
  regulatoryCapital?: number;
  lossDistribution: {
    el: number;
    ul99pct: number;
    ul999pct: number;
  };
}

export interface RetailCreditResult {
  probabilityOfDefault: number;
  expectedLoss: number;
  riskScore: number;
  riskTier: 'PRIME' | 'NEAR_PRIME' | 'SUBPRIME' | 'DEEP_SUBPRIME';
  recommendation: 'APPROVE' | 'REVIEW' | 'DECLINE';
  contributingFactors: Array<{ factor: string; impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; weight: number }>;
}

/**
 * Credit Risk Scoring service.
 *
 * Implements three complementary approaches:
 *  1. Altman Z-Score — structural distress prediction for corporates (1968 + variants)
 *  2. Merton Structural Model — option-theoretic PD from equity market data
 *  3. Retail scorecard — FICO-based retail credit scoring
 *  4. Basel III expected loss framework: EL = PD × LGD × EAD
 */
@Injectable()
export class CreditRiskService {

  // ── Altman Z-Score ────────────────────────────────────────────────────────

  altmanZScore(params: AltmanZScoreParams): AltmanZResult {
    const { workingCapital: WC, totalAssets: TA, retainedEarnings: RE,
            ebit: EBIT, marketValueEquity: MVE, bookValueLiabilities: BVL,
            netSales: S, entityType } = params;

    const x1 = TA > 0 ? WC / TA : 0;
    const x2 = TA > 0 ? RE / TA : 0;
    const x3 = TA > 0 ? EBIT / TA : 0;
    const x4 = BVL > 0 ? MVE / BVL : 0;
    const x5 = TA > 0 ? S / TA : 0;

    let zScore: number;
    let safeThreshold: number;
    let distressThreshold: number;

    if (entityType === 'public') {
      // Original Altman (1968) — public manufacturing firms
      zScore = 1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5;
      safeThreshold = 2.99;
      distressThreshold = 1.81;
    } else if (entityType === 'private') {
      // Altman Z'Score (1983) — private firms, book equity replaces market equity
      zScore = 0.717*x1 + 0.847*x2 + 3.107*x3 + 0.420*x4 + 0.998*x5;
      safeThreshold = 2.90;
      distressThreshold = 1.23;
    } else {
      // Altman Z''Score (1995) — non-manufacturing / services, eliminates x5
      zScore = 6.56*x1 + 3.26*x2 + 6.72*x3 + 1.05*x4;
      safeThreshold = 2.60;
      distressThreshold = 1.10;
    }

    const riskCategory = zScore >= safeThreshold ? 'SAFE' : zScore <= distressThreshold ? 'DISTRESS' : 'GREY';
    const { rating, pd } = this.zScoreToRating(zScore, riskCategory);

    const interpretations: Record<string, string> = {
      SAFE: `Z-Score ${zScore.toFixed(2)} is above the safe zone threshold (${safeThreshold}). Low default risk.`,
      GREY: `Z-Score ${zScore.toFixed(2)} is in the grey zone (${distressThreshold}–${safeThreshold}). Elevated monitoring warranted.`,
      DISTRESS: `Z-Score ${zScore.toFixed(2)} is below the distress threshold (${distressThreshold}). High default probability.`,
    };

    return {
      zScore,
      rating,
      probabilityOfDefault: pd,
      riskCategory,
      ratioBreakdown: {
        x1_workingCapital: x1,
        x2_retainedEarnings: x2,
        x3_ebit: x3,
        x4_equityToDebt: x4,
        x5_salesTurnover: x5,
      },
      interpretation: interpretations[riskCategory],
    };
  }

  // ── Merton Structural Model ───────────────────────────────────────────────

  mertonModel(params: MertonModelParams): MertonResult {
    const { equityValue: E, equityVolatility: σE, debtFaceValue: D, riskFreeRate: r, debtMaturityYears: T } = params;

    // Iteratively solve for asset value (Va) and asset volatility (σA)
    // using: E = Va*N(d1) - D*e^(-rT)*N(d2)  and  σE*E = N(d1)*σA*Va
    let Va = E + D;
    let σA = σE * E / Va;

    for (let i = 0; i < 100; i++) {
      const d1 = (Math.log(Va / D) + (r + 0.5 * σA * σA) * T) / (σA * Math.sqrt(T));
      const d2 = d1 - σA * Math.sqrt(T);
      const Nd1 = normCdf(d1);
      const Nd2 = normCdf(d2);
      const df = Math.exp(-r * T);

      const E_model = Va * Nd1 - D * df * Nd2;
      const σA_new = σE * E / (Va * Nd1);

      const Va_new = E + D * df * Nd2 / Nd1;

      if (Math.abs(Va_new - Va) < 1 && Math.abs(σA_new - σA) < 0.0001) {
        Va = Va_new; σA = σA_new;
        break;
      }
      Va = Va_new; σA = σA_new;
    }

    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(Va / D) + (r + 0.5 * σA * σA) * T) / (σA * sqrtT);
    const d2 = d1 - σA * sqrtT;

    // Risk-neutral PD = N(-d2)
    const riskNeutralPD = normCdf(-d2);

    // Real-world PD ≈ use Sharpe ratio adjustment (assume μ - r = 0.04 historically)
    const marketPriceRisk = 0.04 / σA;
    const d2_realWorld = d2 - marketPriceRisk * sqrtT;
    const probabilityOfDefault = normCdf(-d2_realWorld);

    // Distance to default = d2 (real-world)
    const distanceToDefault = d2_realWorld;

    // Implied credit spread from bond pricing: s ≈ -(1/T)*ln(N(d2) + N(-d2)*R/D) approx
    const recoveryRate = 0.40;
    const bondRN = Math.exp(-r * T) * (normCdf(d2) + (Va / D) * recoveryRate * normCdf(-d2));
    const impliedCreditSpread = bondRN > 0 ? Math.max(-Math.log(bondRN) / T - r, 0) : 0;

    return {
      assetValue: Va,
      assetVolatility: σA,
      distanceToDefault,
      probabilityOfDefault,
      riskNeutralPD,
      impliedCreditSpread,
      creditRating: this.pdToRating(probabilityOfDefault),
    };
  }

  // ── Basel III Expected Loss Framework ─────────────────────────────────────

  expectedLoss(params: CreditScorecardParams): ExpectedLossResult {
    const { probabilityOfDefault: PD, lossGivenDefault: LGD, exposureAtDefault: EAD, maturityYears = 2.5 } = params;

    const el = PD * LGD * EAD;

    // Unexpected loss at 99% confidence (simplified Basel ASRF)
    // UL = LGD * EAD * N(sqrt(1/(1-ρ)) * N^-1(PD) + sqrt(ρ/(1-ρ)) * N^-1(0.999)) - EL
    const ρ = this.assetCorrelation(PD);

    const ul99 = this.baselUl(PD, LGD, EAD, ρ, 0.999);
    const ul999 = this.baselUl(PD, LGD, EAD, ρ, 0.9999);
    const unexpectedLoss = ul99 - el;

    // Basel III RWA for corporate/retail exposures
    const maturityAdj = maturityYears > 0
      ? (1 + (maturityYears - 2.5) * this.maturityAdjustment(PD))
      : 1;
    const k = (LGD * normCdf(
      Math.sqrt(1 / (1 - ρ)) * this.normInvSafe(PD) +
      Math.sqrt(ρ / (1 - ρ)) * this.normInvSafe(0.999),
    ) - LGD * PD) * maturityAdj;
    const rwa = EAD * k * 12.5;
    const regulatoryCapital = rwa * 0.08; // 8% minimum capital ratio

    return {
      expectedLoss: el,
      unexpectedLoss,
      economicCapital: ul99 - el,
      probabilityOfDefault: PD,
      lossGivenDefault: LGD,
      exposureAtDefault: EAD,
      riskWeightedAssets: rwa,
      regulatoryCapital,
      lossDistribution: {
        el,
        ul99pct: ul99,
        ul999pct: ul999,
      },
    };
  }

  // ── Retail Credit Scorecard ───────────────────────────────────────────────

  retailCreditScore(params: RetailCreditParams): RetailCreditResult {
    const { creditScore, debtToIncome, loanToValue, monthsSinceDelinquency, recentInquiries = 0, productType } = params;

    // Base PD lookup by product type
    const basePD: Record<string, number> = {
      mortgage: 0.015, auto: 0.025, personal: 0.05, creditCard: 0.04, business: 0.06,
    };
    let pd = basePD[productType] ?? 0.05;

    // FICO adjustment (log-odds scaling)
    const ficoAdj = (creditScore - 680) / 680;
    pd *= Math.exp(-2.0 * ficoAdj);

    // DTI adjustment
    if (debtToIncome > 0.43) pd *= 1.8;
    else if (debtToIncome > 0.36) pd *= 1.3;
    else if (debtToIncome < 0.20) pd *= 0.7;

    // LTV adjustment (secured products)
    if (loanToValue !== undefined) {
      if (loanToValue > 0.95) pd *= 2.0;
      else if (loanToValue > 0.80) pd *= 1.4;
      else if (loanToValue < 0.60) pd *= 0.8;
    }

    // Delinquency history
    if (monthsSinceDelinquency !== undefined) {
      if (monthsSinceDelinquency < 12) pd *= 4.0;
      else if (monthsSinceDelinquency < 24) pd *= 2.5;
      else if (monthsSinceDelinquency < 48) pd *= 1.5;
    }

    // Recent inquiries
    if (recentInquiries >= 4) pd *= 1.5;
    else if (recentInquiries >= 2) pd *= 1.2;

    pd = Math.min(Math.max(pd, 0.0005), 0.999);

    const lgd = productType === 'mortgage' ? 0.25 : productType === 'auto' ? 0.40 : 0.65;
    const riskScore = Math.round(850 - pd * 5000);

    const riskTier: RetailCreditResult['riskTier'] =
      creditScore >= 720 && pd < 0.03 ? 'PRIME' :
      creditScore >= 660 && pd < 0.07 ? 'NEAR_PRIME' :
      creditScore >= 580 ? 'SUBPRIME' : 'DEEP_SUBPRIME';

    const recommendation: RetailCreditResult['recommendation'] =
      riskTier === 'PRIME' ? 'APPROVE' :
      riskTier === 'NEAR_PRIME' ? 'APPROVE' :
      riskTier === 'SUBPRIME' ? 'REVIEW' : 'DECLINE';

    const factors: RetailCreditResult['contributingFactors'] = [
      {
        factor: 'Credit Score',
        impact: creditScore >= 720 ? 'POSITIVE' : creditScore >= 660 ? 'NEUTRAL' : 'NEGATIVE',
        weight: 0.35,
      },
      {
        factor: 'Debt-to-Income Ratio',
        impact: debtToIncome < 0.28 ? 'POSITIVE' : debtToIncome > 0.43 ? 'NEGATIVE' : 'NEUTRAL',
        weight: 0.20,
      },
      {
        factor: 'Delinquency History',
        impact: monthsSinceDelinquency === undefined ? 'POSITIVE' :
                monthsSinceDelinquency < 24 ? 'NEGATIVE' : 'NEUTRAL',
        weight: 0.25,
      },
      {
        factor: 'Loan-to-Value',
        impact: loanToValue === undefined ? 'NEUTRAL' :
                loanToValue < 0.70 ? 'POSITIVE' : loanToValue > 0.90 ? 'NEGATIVE' : 'NEUTRAL',
        weight: 0.15,
      },
      {
        factor: 'Recent Inquiries',
        impact: recentInquiries === 0 ? 'POSITIVE' : recentInquiries >= 3 ? 'NEGATIVE' : 'NEUTRAL',
        weight: 0.05,
      },
    ];

    return {
      probabilityOfDefault: pd,
      expectedLoss: pd * lgd,
      riskScore: Math.max(300, Math.min(850, riskScore)),
      riskTier,
      recommendation,
      contributingFactors: factors,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private zScoreToRating(z: number, category: string): { rating: string; pd: number } {
    if (category === 'SAFE') {
      if (z > 4.0) return { rating: 'AAA/AA', pd: 0.0005 };
      if (z > 3.5) return { rating: 'A', pd: 0.001 };
      return { rating: 'BBB', pd: 0.003 };
    }
    if (category === 'GREY') {
      if (z > 2.5) return { rating: 'BB+', pd: 0.008 };
      if (z > 2.0) return { rating: 'BB', pd: 0.015 };
      return { rating: 'BB-/B+', pd: 0.030 };
    }
    // DISTRESS
    if (z > 1.0) return { rating: 'B/CCC', pd: 0.08 };
    return { rating: 'D/SD', pd: 0.40 };
  }

  private pdToRating(pd: number): string {
    if (pd < 0.001) return 'AAA';
    if (pd < 0.003) return 'AA';
    if (pd < 0.007) return 'A';
    if (pd < 0.015) return 'BBB';
    if (pd < 0.04)  return 'BB';
    if (pd < 0.10)  return 'B';
    if (pd < 0.25)  return 'CCC';
    return 'D';
  }

  /** Basel III ASRF asset correlation — inversely related to PD */
  private assetCorrelation(pd: number): number {
    const ρMin = 0.12, ρMax = 0.24;
    const k = 50;
    return ρMin * (1 - Math.exp(-k * pd)) / (1 - Math.exp(-k)) +
           ρMax * (1 - (1 - Math.exp(-k * pd)) / (1 - Math.exp(-k)));
  }

  private baselUl(pd: number, lgd: number, ead: number, ρ: number, cl: number): number {
    const z = Math.sqrt(1 / (1 - ρ)) * this.normInvSafe(pd) + Math.sqrt(ρ / (1 - ρ)) * this.normInvSafe(cl);
    return lgd * ead * normCdf(z);
  }

  private maturityAdjustment(pd: number): number {
    return (0.11852 - 0.05478 * Math.log(pd)) ** 2;
  }

  private normInvSafe(p: number): number {
    p = Math.max(1e-9, Math.min(1 - 1e-9, p));
    // Rational approximation (Acklam)
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
               1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
               6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
               -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    if (p < pLow) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      const q = p - 0.5, r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }
}
