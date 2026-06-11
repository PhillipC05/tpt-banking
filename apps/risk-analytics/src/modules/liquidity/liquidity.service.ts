import { Injectable } from '@nestjs/common';

// ── LCR types ─────────────────────────────────────────────────────────────────

export type HqlaLevel = 'LEVEL_1' | 'LEVEL_2A' | 'LEVEL_2B';

export interface HqlaItem {
  description: string;
  level: HqlaLevel;
  marketValue: number;
  /** Override default haircut (0–1). If omitted, uses Basel III standard haircut. */
  customHaircut?: number;
}

export type CashOutflowCategory =
  | 'RETAIL_STABLE'         // stable retail deposits, fully insured
  | 'RETAIL_LESS_STABLE'    // less stable retail deposits
  | 'OPERATIONAL_DEPOSITS'  // wholesale operational deposits (clearing, custody)
  | 'NON_OPERATIONAL_DEPOSITS_FINANCIAL'  // non-operational deposits from financial institutions
  | 'NON_OPERATIONAL_DEPOSITS_CORPORATE'  // non-operational deposits from non-financial corporates
  | 'SECURED_FUNDING_LEVEL1'
  | 'SECURED_FUNDING_LEVEL2A'
  | 'SECURED_FUNDING_LEVEL2B'
  | 'SECURED_FUNDING_OTHER'
  | 'DERIVATIVES_OUTFLOWS'
  | 'CREDIT_LIQUIDITY_FACILITIES_RETAIL'
  | 'CREDIT_LIQUIDITY_FACILITIES_WHOLESALE'
  | 'OTHER_CONTRACTUAL';

export type CashInflowCategory =
  | 'RETAIL_INFLOWS'
  | 'SECURED_LENDING_LEVEL1'
  | 'SECURED_LENDING_LEVEL2A'
  | 'SECURED_LENDING_OTHER'
  | 'UNSECURED_WHOLESALE_INFLOWS'
  | 'OTHER_INFLOWS';

export interface CashOutflow {
  category: CashOutflowCategory;
  description: string;
  balance: number;
  /** Override regulatory run-off rate (0–1). If omitted, uses Basel III standard. */
  customRunOffRate?: number;
}

export interface CashInflow {
  category: CashInflowCategory;
  description: string;
  balance: number;
  /** Override regulatory inflow rate (0–1). If omitted, uses Basel III standard. */
  customInflowRate?: number;
}

// ── NSFR types ────────────────────────────────────────────────────────────────

export type AsfCategory =
  | 'TIER1_CAPITAL'
  | 'TIER2_CAPITAL_OVER_1Y'
  | 'RETAIL_DEPOSITS_STABLE'
  | 'RETAIL_DEPOSITS_LESS_STABLE'
  | 'WHOLESALE_NON_FINANCIAL_OVER_1Y'
  | 'WHOLESALE_NON_FINANCIAL_UNDER_1Y_OPERATIONAL'
  | 'WHOLESALE_FINANCIAL_OVER_6M'
  | 'OTHER_LIABILITIES'
  | 'DERIVATIVES_LIABILITY_NET';

export type RsfCategory =
  | 'CASH_CENTRAL_BANK'
  | 'UNENCUMBERED_LEVEL1_HQLA'
  | 'UNENCUMBERED_LEVEL2A_HQLA'
  | 'UNENCUMBERED_LEVEL2B_HQLA'
  | 'UNENCUMBERED_NON_HQLA_SECURITIES'
  | 'EXCHANGE_TRADED_EQUITIES'
  | 'LOANS_RETAIL_RESIDENTIAL_UNDER_1Y'
  | 'LOANS_RETAIL_RESIDENTIAL_OVER_1Y'
  | 'LOANS_CORPORATE_FINANCIAL_UNDER_1Y'
  | 'LOANS_CORPORATE_FINANCIAL_OVER_1Y'
  | 'LOANS_RETAIL_NON_MORTGAGE'
  | 'INTERBANK_LOANS_UNDER_6M'
  | 'TRADE_FINANCE'
  | 'OTHER_ASSETS';

export interface AsfItem {
  category: AsfCategory;
  description: string;
  balance: number;
  customFactor?: number;
}

export interface RsfItem {
  category: RsfCategory;
  description: string;
  balance: number;
  residualMaturityYears?: number;
  customFactor?: number;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface HqlaBreakdown {
  level1: number;
  level2a: number;
  level2b: number;
  totalHqla: number;
  level2aCap: number;
  level2bCap: number;
  adjustedHqla: number;
}

export interface LcrResult {
  lcr: number;
  lcrPct: string;
  compliant: boolean;
  minimumRequirement: number;
  buffer: number;
  hqla: HqlaBreakdown;
  totalOutflows: number;
  totalInflows: number;
  netCashOutflows: number;
  inflowCap: number;
  outflowsByCategory: Array<{ category: string; balance: number; runOffRate: number; weightedOutflow: number }>;
  inflowsByCategory: Array<{ category: string; balance: number; inflowRate: number; weightedInflow: number }>;
  regulatoryNotes: string[];
}

export interface NsfrResult {
  nsfr: number;
  nsfrPct: string;
  compliant: boolean;
  minimumRequirement: number;
  buffer: number;
  availableStableFunding: number;
  requiredStableFunding: number;
  asfByCategory: Array<{ category: string; balance: number; factor: number; weightedAsf: number }>;
  rsfByCategory: Array<{ category: string; balance: number; factor: number; weightedRsf: number }>;
  regulatoryNotes: string[];
}

// ── Basel III standard run-off and inflow rates ───────────────────────────────

const HQLA_HAIRCUTS: Record<HqlaLevel, number> = {
  LEVEL_1: 0,     // no haircut
  LEVEL_2A: 0.15, // 15% haircut
  LEVEL_2B: 0.50, // 50% haircut
};

const OUTFLOW_RATES: Record<CashOutflowCategory, number> = {
  RETAIL_STABLE: 0.03,
  RETAIL_LESS_STABLE: 0.10,
  OPERATIONAL_DEPOSITS: 0.25,
  NON_OPERATIONAL_DEPOSITS_FINANCIAL: 1.00,
  NON_OPERATIONAL_DEPOSITS_CORPORATE: 0.40,
  SECURED_FUNDING_LEVEL1: 0,
  SECURED_FUNDING_LEVEL2A: 0.15,
  SECURED_FUNDING_LEVEL2B: 0.25,
  SECURED_FUNDING_OTHER: 1.00,
  DERIVATIVES_OUTFLOWS: 1.00,
  CREDIT_LIQUIDITY_FACILITIES_RETAIL: 0.05,
  CREDIT_LIQUIDITY_FACILITIES_WHOLESALE: 0.30,
  OTHER_CONTRACTUAL: 1.00,
};

const INFLOW_RATES: Record<CashInflowCategory, number> = {
  RETAIL_INFLOWS: 0.50,
  SECURED_LENDING_LEVEL1: 0,
  SECURED_LENDING_LEVEL2A: 0.15,
  SECURED_LENDING_OTHER: 1.00,
  UNSECURED_WHOLESALE_INFLOWS: 1.00,
  OTHER_INFLOWS: 1.00,
};

// ASF factors (Available Stable Funding)
const ASF_FACTORS: Record<AsfCategory, number> = {
  TIER1_CAPITAL: 1.00,
  TIER2_CAPITAL_OVER_1Y: 1.00,
  RETAIL_DEPOSITS_STABLE: 0.95,
  RETAIL_DEPOSITS_LESS_STABLE: 0.90,
  WHOLESALE_NON_FINANCIAL_OVER_1Y: 0.50,
  WHOLESALE_NON_FINANCIAL_UNDER_1Y_OPERATIONAL: 0.50,
  WHOLESALE_FINANCIAL_OVER_6M: 0.50,
  OTHER_LIABILITIES: 0,
  DERIVATIVES_LIABILITY_NET: 0,
};

// RSF factors (Required Stable Funding)
const RSF_FACTORS: Record<RsfCategory, number> = {
  CASH_CENTRAL_BANK: 0,
  UNENCUMBERED_LEVEL1_HQLA: 0.05,
  UNENCUMBERED_LEVEL2A_HQLA: 0.15,
  UNENCUMBERED_LEVEL2B_HQLA: 0.50,
  UNENCUMBERED_NON_HQLA_SECURITIES: 0.85,
  EXCHANGE_TRADED_EQUITIES: 0.50,
  LOANS_RETAIL_RESIDENTIAL_UNDER_1Y: 0.50,
  LOANS_RETAIL_RESIDENTIAL_OVER_1Y: 0.65,
  LOANS_CORPORATE_FINANCIAL_UNDER_1Y: 0.50,
  LOANS_CORPORATE_FINANCIAL_OVER_1Y: 0.65,
  LOANS_RETAIL_NON_MORTGAGE: 0.85,
  INTERBANK_LOANS_UNDER_6M: 0.10,
  TRADE_FINANCE: 0.85,
  OTHER_ASSETS: 1.00,
};

/**
 * Liquidity risk module — Basel III LCR and NSFR.
 *
 * LCR = HQLA / Net Cash Outflows (30-day stress) ≥ 100%
 *   HQLA: Level 1 (no haircut), Level 2A (15% haircut, ≤40% of HQLA), Level 2B (50% haircut, ≤15% of HQLA)
 *   Net Cash Outflows = Total Outflows - min(Total Inflows, 75% of Total Outflows)
 *
 * NSFR = Available Stable Funding / Required Stable Funding ≥ 100%
 */
@Injectable()
export class LiquidityService {

  // ── LCR Calculation ───────────────────────────────────────────────────────

  computeLcr(
    hqlaItems: HqlaItem[],
    outflows: CashOutflow[],
    inflows: CashInflow[],
  ): LcrResult {
    const notes: string[] = [];

    // ── Step 1: Compute HQLA ──────────────────────────────────────────────
    let level1 = 0, level2a = 0, level2b = 0;
    for (const item of hqlaItems) {
      const haircut = item.customHaircut ?? HQLA_HAIRCUTS[item.level];
      const adjusted = item.marketValue * (1 - haircut);
      if (item.level === 'LEVEL_1') level1 += adjusted;
      else if (item.level === 'LEVEL_2A') level2a += adjusted;
      else level2b += adjusted;
    }

    const rawTotal = level1 + level2a + level2b;

    // Level 2A cap: ≤ 40% of total adjusted HQLA
    const maxLevel2a = (level1 + level2b) / 0.60 * 0.40;
    const cappedLevel2a = Math.min(level2a, maxLevel2a);
    if (level2a > maxLevel2a) {
      notes.push(`Level 2A assets capped at 40% of HQLA (excess: ${(level2a - maxLevel2a).toFixed(0)})`);
    }

    // Level 2B cap: ≤ 15% of total adjusted HQLA
    const maxLevel2b = (level1 + cappedLevel2a) / 0.85 * 0.15;
    const cappedLevel2b = Math.min(level2b, maxLevel2b);
    if (level2b > maxLevel2b) {
      notes.push(`Level 2B assets capped at 15% of HQLA (excess: ${(level2b - maxLevel2b).toFixed(0)})`);
    }

    const adjustedHqla = level1 + cappedLevel2a + cappedLevel2b;

    // ── Step 2: Compute cash outflows (30-day stress) ─────────────────────
    const outflowRows = outflows.map((o) => {
      const rate = o.customRunOffRate ?? OUTFLOW_RATES[o.category];
      return {
        category: o.category,
        description: o.description,
        balance: o.balance,
        runOffRate: rate,
        weightedOutflow: o.balance * rate,
      };
    });
    const totalOutflows = outflowRows.reduce((s, r) => s + r.weightedOutflow, 0);

    // ── Step 3: Compute cash inflows ──────────────────────────────────────
    const inflowRows = inflows.map((i) => {
      const rate = i.customInflowRate ?? INFLOW_RATES[i.category];
      return {
        category: i.category,
        description: i.description,
        balance: i.balance,
        inflowRate: rate,
        weightedInflow: i.balance * rate,
      };
    });
    const totalInflows = inflowRows.reduce((s, r) => s + r.weightedInflow, 0);

    // Inflow cap: inflows ≤ 75% of gross outflows
    const inflowCap = totalOutflows * 0.75;
    const cappedInflows = Math.min(totalInflows, inflowCap);
    if (totalInflows > inflowCap) {
      notes.push(`Cash inflows capped at 75% of gross outflows (excess: ${(totalInflows - inflowCap).toFixed(0)})`);
    }

    // Net cash outflows
    const netCashOutflows = Math.max(totalOutflows - cappedInflows, 0);

    // ── Step 4: LCR ───────────────────────────────────────────────────────
    const lcr = netCashOutflows > 0 ? adjustedHqla / netCashOutflows : Infinity;
    const minimum = 1.00; // 100% minimum
    const compliant = lcr >= minimum;

    if (!compliant) {
      notes.push(`LCR BREACH: ${(lcr * 100).toFixed(2)}% is below the 100% minimum requirement.`);
    }

    return {
      lcr,
      lcrPct: `${(lcr * 100).toFixed(2)}%`,
      compliant,
      minimumRequirement: minimum,
      buffer: (lcr - minimum) * netCashOutflows,
      hqla: { level1, level2a: cappedLevel2a, level2b: cappedLevel2b, totalHqla: rawTotal, level2aCap: maxLevel2a, level2bCap: maxLevel2b, adjustedHqla },
      totalOutflows,
      totalInflows,
      netCashOutflows,
      inflowCap,
      outflowsByCategory: outflowRows,
      inflowsByCategory: inflowRows,
      regulatoryNotes: notes,
    };
  }

  // ── NSFR Calculation ──────────────────────────────────────────────────────

  computeNsfr(asfItems: AsfItem[], rsfItems: RsfItem[]): NsfrResult {
    const notes: string[] = [];

    // Available Stable Funding
    const asfRows = asfItems.map((item) => {
      const factor = item.customFactor ?? ASF_FACTORS[item.category];
      return {
        category: item.category,
        description: item.description,
        balance: item.balance,
        factor,
        weightedAsf: item.balance * factor,
      };
    });
    const asf = asfRows.reduce((s, r) => s + r.weightedAsf, 0);

    // Required Stable Funding
    const rsfRows = rsfItems.map((item) => {
      let factor = item.customFactor ?? RSF_FACTORS[item.category];
      // Maturity-adjusted RSF: assets with residual maturity < 1 year have lower factor
      if (item.residualMaturityYears !== undefined && item.residualMaturityYears < 1) {
        factor = Math.min(factor, 0.50);
      }
      return {
        category: item.category,
        description: item.description,
        balance: item.balance,
        factor,
        weightedRsf: item.balance * factor,
      };
    });
    const rsf = rsfRows.reduce((s, r) => s + r.weightedRsf, 0);

    const nsfr = rsf > 0 ? asf / rsf : Infinity;
    const minimum = 1.00;
    const compliant = nsfr >= minimum;

    if (!compliant) {
      notes.push(`NSFR BREACH: ${(nsfr * 100).toFixed(2)}% is below the 100% minimum requirement.`);
    }
    if (asf < rsf * 1.05) {
      notes.push(`NSFR buffer is thin (< 5%). Consider increasing long-term funding or reducing RSF.`);
    }

    return {
      nsfr,
      nsfrPct: `${(nsfr * 100).toFixed(2)}%`,
      compliant,
      minimumRequirement: minimum,
      buffer: (nsfr - minimum) * rsf,
      availableStableFunding: asf,
      requiredStableFunding: rsf,
      asfByCategory: asfRows,
      rsfByCategory: rsfRows,
      regulatoryNotes: notes,
    };
  }

  // ── Regulatory metadata ───────────────────────────────────────────────────

  getRegulatoryRates() {
    return {
      lcrHqlaHaircuts: HQLA_HAIRCUTS,
      lcrOutflowRates: OUTFLOW_RATES,
      lcrInflowRates: INFLOW_RATES,
      nsfrAsfFactors: ASF_FACTORS,
      nsfrRsfFactors: RSF_FACTORS,
      lcrMinimum: '100% (Basel III LCR, CRR2/LCR DA)',
      nsfrMinimum: '100% (Basel III NSFR, CRR2/NSFR DA)',
      lcrInflowCap: '75% of gross outflows',
      lcrLevel2aCap: '40% of adjusted HQLA',
      lcrLevel2bCap: '15% of adjusted HQLA',
    };
  }
}
