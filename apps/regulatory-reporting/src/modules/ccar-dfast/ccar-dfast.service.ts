import { Injectable } from '@nestjs/common';

// ── Input types ───────────────────────────────────────────────────────────────

export type CcarScenario = 'SEVERELY_ADVERSE' | 'ADVERSE' | 'BASELINE';

export interface LoanPortfolioSegment {
  segmentName: string;
  assetClass: 'CONSUMER' | 'RESIDENTIAL_MORTGAGE' | 'COMMERCIAL_REAL_ESTATE' | 'C_AND_I' | 'CREDIT_CARD' | 'AUTO' | 'STUDENT' | 'OTHER';
  beginningBalance: number;
  /** Annualised charge-off rate under scenario (fraction, e.g. 0.02 = 2%) */
  chargeOffRate: number;
  /** Annualised recovery rate (fraction) */
  recoveryRate: number;
}

export interface RevenueProjection {
  quarterLabel: string;   // e.g. 'Q1 2025'
  netInterestIncome: number;
  nonInterestIncome: number;
  nonInterestExpense: number;
  provisionForCreditLosses: number;
}

export interface CapitalActionPlan {
  /** Planned dividends per quarter */
  commonDividendsPerQuarter: number;
  /** Planned share repurchases per quarter */
  shareRepurchasesPerQuarter: number;
  /** Planned new capital issuance */
  newCapitalIssuance: number;
}

export interface CcarDfastInput {
  institutionName: string;
  leiCode?: string;
  reportingYear: number;
  scenario: CcarScenario;
  /** Starting CET1 capital */
  beginningCet1Capital: number;
  /** Starting RWA */
  beginningRwa: number;
  /** Starting total assets */
  totalAssets: number;
  /** 9-quarter revenue projections (Q1–Q9) */
  revenueProjections: RevenueProjection[];
  loanPortfolio: LoanPortfolioSegment[];
  capitalActionPlan: CapitalActionPlan;
  /** Tax rate (e.g. 0.21) */
  taxRate: number;
  /** RWA growth rate per quarter (e.g. 0.005 = 0.5%) */
  rwaGrowthPerQuarter?: number;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface QuarterlyProjection {
  quarter: number;
  quarterLabel: string;
  ppnr: number;           // Pre-Provision Net Revenue
  provisionForCreditLosses: number;
  preTaxIncome: number;
  taxExpense: number;
  netIncome: number;
  totalLoanLosses: number;
  capitalActions: number; // dividends + buybacks - issuance
  cet1Capital: number;
  rwa: number;
  cet1Ratio: number;
  tier1Ratio: number;     // simplified: Tier 1 ≈ CET1 (no AT1 changes modelled)
  totalCapitalRatio: number;
  leverageRatio?: number;
}

export interface LoanLossProjection {
  segmentName: string;
  assetClass: string;
  beginningBalance: number;
  nineQuarterChargeOffRate: number;
  projectedLosses: number;
  projectedRecoveries: number;
  netChargeOffs: number;
}

export interface CcarDfastReport {
  reportId: string;
  institutionName: string;
  leiCode: string | undefined;
  reportingYear: number;
  scenario: CcarScenario;
  scenarioDescription: string;
  generatedAt: string;
  summaryMetrics: {
    nineQuarterPpnr: number;
    nineQuarterProvision: number;
    nineQuarterNetIncome: number;
    nineQuarterNetChargeOffs: number;
    peakLoanLossRate: number;
    minimumCet1Ratio: number;
    minimumCet1Quarter: string;
    minimumTotalCapitalRatio: number;
    endingCet1Ratio: number;
    endingCet1Capital: number;
    endingRwa: number;
  };
  quarterlyProjections: QuarterlyProjection[];
  loanLossProjections: LoanLossProjection[];
  stressTestResult: {
    passesMinCet1: boolean;      // minimum CET1 ≥ 4.5% throughout
    passesMinTier1: boolean;     // minimum Tier 1 ≥ 6%
    passesMinTotalCapital: boolean;  // minimum total capital ≥ 8%
    overallPass: boolean;
    regulatoryFindings: string[];
  };
}

// ── CCAR 2024 scenario economic assumptions ───────────────────────────────────
// Source: Federal Reserve 2024 stress test scenario economic variables

const SCENARIO_DESCRIPTIONS: Record<CcarScenario, string> = {
  SEVERELY_ADVERSE:
    'Fed CCAR 2024 Severely Adverse: severe global recession, unemployment +6.5pp to ~10%, ' +
    'GDP -8.5%, equities -55%, CRE -40%, IG spreads +200bps, HY spreads +500bps.',
  ADVERSE:
    'Fed CCAR 2024 Adverse: moderate recession, unemployment +3.5pp, ' +
    'GDP -4%, equities -35%, credit spreads widening.',
  BASELINE:
    'Fed CCAR 2024 Baseline: consensus forecast, moderate growth, ' +
    'gradual rate normalization, stable credit conditions.',
};

// Default loss rate multipliers by scenario and asset class
const SCENARIO_LOSS_MULTIPLIERS: Record<CcarScenario, Record<string, number>> = {
  SEVERELY_ADVERSE: {
    CONSUMER: 3.5, RESIDENTIAL_MORTGAGE: 2.5, COMMERCIAL_REAL_ESTATE: 4.0,
    C_AND_I: 3.0, CREDIT_CARD: 3.5, AUTO: 3.0, STUDENT: 2.5, OTHER: 3.0,
  },
  ADVERSE: {
    CONSUMER: 2.0, RESIDENTIAL_MORTGAGE: 1.5, COMMERCIAL_REAL_ESTATE: 2.5,
    C_AND_I: 1.8, CREDIT_CARD: 2.0, AUTO: 1.8, STUDENT: 1.5, OTHER: 2.0,
  },
  BASELINE: {
    CONSUMER: 1.0, RESIDENTIAL_MORTGAGE: 1.0, COMMERCIAL_REAL_ESTATE: 1.0,
    C_AND_I: 1.0, CREDIT_CARD: 1.0, AUTO: 1.0, STUDENT: 1.0, OTHER: 1.0,
  },
};

// PPNR reduction factors by scenario
const PPNR_MULTIPLIERS: Record<CcarScenario, number> = {
  SEVERELY_ADVERSE: 0.65,
  ADVERSE: 0.82,
  BASELINE: 1.00,
};

let reportCounter = 0;

@Injectable()
export class CcarDfastService {

  generateReport(input: CcarDfastInput): CcarDfastReport {
    const findings: string[] = [];

    // ── Loan loss projections (9-quarter) ──────────────────────────────────
    const lossMultipliers = SCENARIO_LOSS_MULTIPLIERS[input.scenario];
    const ppnrMult = PPNR_MULTIPLIERS[input.scenario];

    const loanLossProjections: LoanLossProjection[] = input.loanPortfolio.map((seg) => {
      const multiplier = lossMultipliers[seg.assetClass] ?? 2.0;
      const adjustedChargeOffRate = seg.chargeOffRate * multiplier;
      // 9-quarter loss = annualised rate × 2.25 years × balance
      const grossLosses = seg.beginningBalance * adjustedChargeOffRate * 2.25;
      const recoveries = grossLosses * seg.recoveryRate;
      const netChargeOffs = grossLosses - recoveries;
      const nineQtrChargeOffRate = adjustedChargeOffRate * 2.25;

      return {
        segmentName: seg.segmentName,
        assetClass: seg.assetClass,
        beginningBalance: seg.beginningBalance,
        nineQuarterChargeOffRate: nineQtrChargeOffRate,
        projectedLosses: grossLosses,
        projectedRecoveries: recoveries,
        netChargeOffs,
      };
    });

    const totalNcoBudget = loanLossProjections.reduce((s, l) => s + l.netChargeOffs, 0);

    // ── Quarterly projections (9 quarters = Q1 through Q9) ────────────────
    const quarters: QuarterlyProjection[] = [];
    let runningCet1 = input.beginningCet1Capital;
    let runningRwa = input.beginningRwa;
    let minCet1Ratio = Infinity;
    let minCet1Quarter = '';
    let minTier1Ratio = Infinity;
    let minTotalCapRatio = Infinity;

    const numQuarters = Math.min(input.revenueProjections.length, 9);
    const ncoPerQuarter = totalNcoBudget / numQuarters;

    let totalPpnr = 0;
    let totalProvision = 0;
    let totalNetIncome = 0;

    for (let q = 0; q < numQuarters; q++) {
      const rev = input.revenueProjections[q];

      // Apply scenario PPNR haircut
      const ppnr = (rev.netInterestIncome + rev.nonInterestIncome - rev.nonInterestExpense) * ppnrMult;

      // Provision = scenario-stressed charge-offs + building reserve (simplified)
      const provision = Math.max(rev.provisionForCreditLosses, ncoPerQuarter * 1.1);

      const preTaxIncome = ppnr - provision;
      const taxExpense = preTaxIncome > 0 ? preTaxIncome * input.taxRate : 0;
      const netIncome = preTaxIncome - taxExpense;

      // Capital actions
      const capitalActions =
        input.capitalActionPlan.commonDividendsPerQuarter +
        input.capitalActionPlan.shareRepurchasesPerQuarter -
        (q === 0 ? input.capitalActionPlan.newCapitalIssuance : 0);

      // Ending CET1
      runningCet1 = runningCet1 + netIncome - capitalActions;
      runningRwa = runningRwa * (1 + (input.rwaGrowthPerQuarter ?? 0));

      // Capital ratios
      const cet1Ratio = runningRwa > 0 ? runningCet1 / runningRwa : Infinity;
      const tier1Ratio = cet1Ratio; // simplified (no AT1 modelled)
      const totalCapRatio = cet1Ratio + 0.02; // simplified: T2 adds ~200bps

      totalPpnr += ppnr;
      totalProvision += provision;
      totalNetIncome += netIncome;

      if (cet1Ratio < minCet1Ratio) {
        minCet1Ratio = cet1Ratio;
        minCet1Quarter = rev.quarterLabel;
      }
      if (tier1Ratio < minTier1Ratio) minTier1Ratio = tier1Ratio;
      if (totalCapRatio < minTotalCapRatio) minTotalCapRatio = totalCapRatio;

      quarters.push({
        quarter: q + 1,
        quarterLabel: rev.quarterLabel,
        ppnr,
        provisionForCreditLosses: provision,
        preTaxIncome,
        taxExpense,
        netIncome,
        totalLoanLosses: ncoPerQuarter,
        capitalActions,
        cet1Capital: runningCet1,
        rwa: runningRwa,
        cet1Ratio,
        tier1Ratio,
        totalCapitalRatio: totalCapRatio,
      });
    }

    const passesMinCet1 = minCet1Ratio >= 0.045;
    const passesMinTier1 = minTier1Ratio >= 0.06;
    const passesMinTotalCapital = minTotalCapRatio >= 0.08;

    if (!passesMinCet1) findings.push(`FAIL: Minimum CET1 ratio ${(minCet1Ratio * 100).toFixed(2)}% breaches 4.5% floor in ${minCet1Quarter}`);
    if (!passesMinTier1) findings.push(`FAIL: Minimum Tier 1 ratio ${(minTier1Ratio * 100).toFixed(2)}% breaches 6% floor`);
    if (!passesMinTotalCapital) findings.push(`FAIL: Minimum Total Capital ratio ${(minTotalCapRatio * 100).toFixed(2)}% breaches 8% floor`);
    if (passesMinCet1 && passesMinTier1 && passesMinTotalCapital) findings.push('PASS: All capital ratios remain above regulatory minimums throughout the 9-quarter horizon.');

    const peakLossRate = loanLossProjections.length > 0
      ? Math.max(...loanLossProjections.map((l) => l.nineQuarterChargeOffRate))
      : 0;

    const reportId = `CCAR-${input.reportingYear}-${input.scenario.slice(0, 2)}-${String(++reportCounter).padStart(4, '0')}`;

    return {
      reportId,
      institutionName: input.institutionName,
      leiCode: input.leiCode,
      reportingYear: input.reportingYear,
      scenario: input.scenario,
      scenarioDescription: SCENARIO_DESCRIPTIONS[input.scenario],
      generatedAt: new Date().toISOString(),
      summaryMetrics: {
        nineQuarterPpnr: totalPpnr,
        nineQuarterProvision: totalProvision,
        nineQuarterNetIncome: totalNetIncome,
        nineQuarterNetChargeOffs: totalNcoBudget,
        peakLoanLossRate: peakLossRate,
        minimumCet1Ratio: minCet1Ratio,
        minimumCet1Quarter: minCet1Quarter,
        minimumTotalCapitalRatio: minTotalCapRatio,
        endingCet1Ratio: quarters.at(-1)?.cet1Ratio ?? 0,
        endingCet1Capital: runningCet1,
        endingRwa: runningRwa,
      },
      quarterlyProjections: quarters,
      loanLossProjections,
      stressTestResult: {
        passesMinCet1,
        passesMinTier1,
        passesMinTotalCapital,
        overallPass: passesMinCet1 && passesMinTier1 && passesMinTotalCapital,
        regulatoryFindings: findings,
      },
    };
  }

  runAllScenarios(baseInput: Omit<CcarDfastInput, 'scenario'>): {
    severelyAdverse: CcarDfastReport;
    adverse: CcarDfastReport;
    baseline: CcarDfastReport;
    summary: {
      worstMinCet1Ratio: number;
      worstScenario: CcarScenario;
      allScenariosPass: boolean;
    };
  } {
    const scenarios: CcarScenario[] = ['SEVERELY_ADVERSE', 'ADVERSE', 'BASELINE'];
    const [severelyAdverse, adverse, baseline] = scenarios.map((s) =>
      this.generateReport({ ...baseInput, scenario: s }),
    );

    const ratios: Array<{ scenario: CcarScenario; ratio: number }> = [
      { scenario: 'SEVERELY_ADVERSE', ratio: severelyAdverse.summaryMetrics.minimumCet1Ratio },
      { scenario: 'ADVERSE', ratio: adverse.summaryMetrics.minimumCet1Ratio },
      { scenario: 'BASELINE', ratio: baseline.summaryMetrics.minimumCet1Ratio },
    ];

    const worst = ratios.reduce((a, b) => (a.ratio < b.ratio ? a : b));

    return {
      severelyAdverse,
      adverse,
      baseline,
      summary: {
        worstMinCet1Ratio: worst.ratio,
        worstScenario: worst.scenario,
        allScenariosPass:
          severelyAdverse.stressTestResult.overallPass &&
          adverse.stressTestResult.overallPass &&
          baseline.stressTestResult.overallPass,
      },
    };
  }

  getScenarioDefinitions() {
    return Object.entries(SCENARIO_DESCRIPTIONS).map(([key, desc]) => ({
      scenarioKey: key,
      description: desc,
      lossMultipliers: SCENARIO_LOSS_MULTIPLIERS[key as CcarScenario],
      ppnrHaircut: `${((1 - PPNR_MULTIPLIERS[key as CcarScenario]) * 100).toFixed(0)}%`,
    }));
  }
}
