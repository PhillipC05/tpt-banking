import { Injectable } from '@nestjs/common';

// ── Net Capital Rule 15c3-1 types ─────────────────────────────────────────────

export interface NetCapitalAsset {
  description: string;
  assetType: NetCapitalAssetType;
  marketValue: number;
  /** Override standard haircut (0–1) */
  customHaircut?: number;
}

export type NetCapitalAssetType =
  | 'CASH_AND_CASH_EQUIVALENTS'
  | 'US_TREASURY_UNDER_1Y'
  | 'US_TREASURY_1_5Y'
  | 'US_TREASURY_OVER_5Y'
  | 'US_AGENCY_UNDER_1Y'
  | 'US_AGENCY_1_5Y'
  | 'US_AGENCY_OVER_5Y'
  | 'MUNICIPAL_BONDS'
  | 'INVESTMENT_GRADE_CORPORATE_BONDS'
  | 'NON_INVESTMENT_GRADE_BONDS'
  | 'EQUITIES_NYSE_AMEX'       // exchange-traded
  | 'EQUITIES_OTC_QUALIFYING'  // NASDAQ qualifying
  | 'EQUITIES_NON_QUALIFYING'  // penny stocks, etc.
  | 'OPTIONS'
  | 'FUTURES'
  | 'DERIVATIVES_OTHER'
  | 'RECEIVABLES_CUSTOMERS'
  | 'RECEIVABLES_BROKERS_DEALERS'
  | 'SECURITIES_BORROWED'
  | 'DEFERRED_TAX_ASSETS'
  | 'GOODWILL_AND_INTANGIBLES'
  | 'OTHER_ALLOWABLE'
  | 'OTHER_NON_ALLOWABLE';

export interface Liability {
  description: string;
  amount: number;
  isSubordinatedDebt?: boolean;  // subordinated debt counts toward capital
}

export interface CustomerAccountStats {
  totalCustomerAccounts: number;
  totalCustomerDebitItems: number;    // money customers owe the BD
  totalCustomerCreditItems: number;   // money BD owes customers
  totalCustomerSecuritiesValue: number;
}

export interface NetCapitalInput {
  firmName: string;
  crdNumber?: string;
  reportingPeriodEnd: string;  // ISO date
  assets: NetCapitalAsset[];
  liabilities: Liability[];
  customerAccounts: CustomerAccountStats;
  /** Standard or Alternative method. Most large BDs use Alternative (2% of debit items). */
  method: 'STANDARD' | 'ALTERNATIVE';
  /** For Alternative method: aggregate debit items (customer and proprietary) */
  aggregateDebitItems?: number;
}

// ── FOCUS Report types ────────────────────────────────────────────────────────

export interface FocusReportInput {
  firmName: string;
  crdNumber?: string;
  reportingPeriodEnd: string;
  // Balance sheet
  cashAndReceivables: number;
  securitiesOwned: number;
  otherAssets: number;
  payablesToCustomers: number;
  payablesToBrokersDealers: number;
  shortPositions: number;
  otherLiabilities: number;
  subordinatedLiabilities: number;
  stockholdersEquity: number;
  // Income statement
  commissionsRevenue: number;
  principalTransactionsRevenue: number;
  investmentBankingRevenue: number;
  otherRevenue: number;
  compensationExpense: number;
  clearingExpense: number;
  otherExpenses: number;
  // Net capital from NetCapitalInput
  netCapitalResult?: NetCapitalResult;
}

// ── TRACE / CAT summary ───────────────────────────────────────────────────────

export interface TradeReportSummary {
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  corporateBondTrades: number;
  agencyBondTrades: number;
  totalTradeReports: number;
  lateReports: number;
  cancelledReports: number;
  complianceRate: number;   // fraction of trades reported timely
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface NetCapitalResult {
  reportId: string;
  firmName: string;
  crdNumber: string | undefined;
  reportingPeriodEnd: string;
  generatedAt: string;
  method: 'STANDARD' | 'ALTERNATIVE';
  totalAllowableAssets: number;
  totalDeductions: number;
  totalLiabilities: number;
  subordinatedDebt: number;
  netCapital: number;
  minimumNetCapital: number;
  netCapitalCushion: number;
  netCapitalRatio: number;
  aggregateIndebtednessRatio?: number;     // for Standard method
  aggregateIndebtednessLimit?: number;
  alternativeRequirement?: number;         // for Alternative method (2% of debit items)
  earlyWarningLevel?: number;              // 120% of minimum (early warning threshold)
  compliant: boolean;
  earlyWarning: boolean;
  assetBreakdown: Array<{ assetType: string; description: string; marketValue: number; haircut: number; allowableValue: number }>;
  regulatoryNotes: string[];
}

export interface FocusReport {
  reportId: string;
  firmName: string;
  crdNumber: string | undefined;
  reportingPeriodEnd: string;
  generatedAt: string;
  balanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    subordinatedLiabilities: number;
    stockholdersEquity: number;
  };
  incomeStatement: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    revenueByCategory: { commissions: number; principalTransactions: number; investmentBanking: number; other: number };
  };
  netCapitalSummary: NetCapitalResult | null;
  sipcAssessment: {
    assessableRevenue: number;
    sipcAssessmentRate: number;
    sipcAssessmentAmount: number;
  };
}

// ── Standard SEC Rule 15c3-1 haircuts ─────────────────────────────────────────

const HAIRCUTS: Record<NetCapitalAssetType, number> = {
  CASH_AND_CASH_EQUIVALENTS: 0,
  US_TREASURY_UNDER_1Y: 0,
  US_TREASURY_1_5Y: 0.005,
  US_TREASURY_OVER_5Y: 0.025,
  US_AGENCY_UNDER_1Y: 0.001,
  US_AGENCY_1_5Y: 0.010,
  US_AGENCY_OVER_5Y: 0.030,
  MUNICIPAL_BONDS: 0.075,
  INVESTMENT_GRADE_CORPORATE_BONDS: 0.15,
  NON_INVESTMENT_GRADE_BONDS: 0.30,
  EQUITIES_NYSE_AMEX: 0.15,
  EQUITIES_OTC_QUALIFYING: 0.15,
  EQUITIES_NON_QUALIFYING: 1.00,
  OPTIONS: 0.15,
  FUTURES: 0.05,
  DERIVATIVES_OTHER: 0.15,
  RECEIVABLES_CUSTOMERS: 0.01,
  RECEIVABLES_BROKERS_DEALERS: 0,
  SECURITIES_BORROWED: 0.01,
  DEFERRED_TAX_ASSETS: 1.00,          // 100% deduction (not allowable)
  GOODWILL_AND_INTANGIBLES: 1.00,     // 100% deduction
  OTHER_ALLOWABLE: 0.05,
  OTHER_NON_ALLOWABLE: 1.00,
};

const MINIMUM_NET_CAPITAL = 250_000; // $250,000 regulatory minimum for most BDs

let reportCounter = 0;

@Injectable()
export class FinraService {

  // ── Net Capital (Rule 15c3-1) ─────────────────────────────────────────────

  computeNetCapital(input: NetCapitalInput): NetCapitalResult {
    const notes: string[] = [];

    // ── Step 1: Allowable assets ──────────────────────────────────────────
    const assetRows = input.assets.map((a) => {
      const haircut = a.customHaircut ?? HAIRCUTS[a.assetType] ?? 1.0;
      const allowableValue = a.marketValue * (1 - haircut);
      return {
        assetType: a.assetType,
        description: a.description,
        marketValue: a.marketValue,
        haircut,
        allowableValue,
      };
    });
    const totalAllowable = assetRows.reduce((s, r) => s + r.allowableValue, 0);
    const totalDeductions = assetRows.reduce((s, r) => s + (r.marketValue - r.allowableValue), 0);

    // ── Step 2: Liabilities ───────────────────────────────────────────────
    const subordinatedDebt = input.liabilities
      .filter((l) => l.isSubordinatedDebt)
      .reduce((s, l) => s + l.amount, 0);
    const totalLiabilities = input.liabilities
      .filter((l) => !l.isSubordinatedDebt)
      .reduce((s, l) => s + l.amount, 0);

    // ── Step 3: Net Capital ───────────────────────────────────────────────
    const netCapital = totalAllowable - totalLiabilities + subordinatedDebt;

    // ── Step 4: Minimum requirement ───────────────────────────────────────
    let minimumNetCapital = MINIMUM_NET_CAPITAL;
    let aggregateIndebtednessRatio: number | undefined;
    let aggregateIndebtednessLimit: number | undefined;
    let alternativeRequirement: number | undefined;

    if (input.method === 'STANDARD') {
      // Aggregate indebtedness ratio ≤ 15:1
      const totalLiabilitiesForAI = totalLiabilities;
      aggregateIndebtednessRatio = netCapital > 0 ? totalLiabilitiesForAI / netCapital : Infinity;
      aggregateIndebtednessLimit = 15;

      if (aggregateIndebtednessRatio > 12) {
        notes.push(`WARNING: Aggregate indebtedness ratio ${aggregateIndebtednessRatio.toFixed(2)}:1 approaching limit of 15:1`);
      }
      if (aggregateIndebtednessRatio > 15) {
        notes.push(`BREACH: Aggregate indebtedness ratio ${aggregateIndebtednessRatio.toFixed(2)}:1 exceeds 15:1 limit`);
      }
    } else {
      // Alternative method: net capital ≥ 2% of aggregate debit items
      const debitItems = input.aggregateDebitItems ?? 0;
      alternativeRequirement = debitItems * 0.02;
      minimumNetCapital = Math.max(MINIMUM_NET_CAPITAL, alternativeRequirement);
      notes.push(`Alternative method: minimum net capital = max($250K, 2% × ${debitItems.toFixed(0)} = ${alternativeRequirement.toFixed(0)})`);
    }

    const compliant = netCapital >= minimumNetCapital;
    const earlyWarningLevel = minimumNetCapital * 1.20;
    const earlyWarning = netCapital < earlyWarningLevel && netCapital >= minimumNetCapital;

    if (!compliant) {
      notes.push(`NET CAPITAL DEFICIENCY: ${netCapital.toFixed(0)} < minimum ${minimumNetCapital.toFixed(0)}`);
    } else if (earlyWarning) {
      notes.push(`EARLY WARNING: Net capital ${netCapital.toFixed(0)} is within 120% of minimum (${earlyWarningLevel.toFixed(0)}). Notification required.`);
    }

    const reportId = `FINRA-NC-${Date.now()}-${String(++reportCounter).padStart(4, '0')}`;

    return {
      reportId,
      firmName: input.firmName,
      crdNumber: input.crdNumber,
      reportingPeriodEnd: input.reportingPeriodEnd,
      generatedAt: new Date().toISOString(),
      method: input.method,
      totalAllowableAssets: totalAllowable,
      totalDeductions,
      totalLiabilities,
      subordinatedDebt,
      netCapital,
      minimumNetCapital,
      netCapitalCushion: netCapital - minimumNetCapital,
      netCapitalRatio: minimumNetCapital > 0 ? netCapital / minimumNetCapital : Infinity,
      aggregateIndebtednessRatio,
      aggregateIndebtednessLimit,
      alternativeRequirement,
      earlyWarningLevel,
      compliant,
      earlyWarning,
      assetBreakdown: assetRows,
      regulatoryNotes: notes,
    };
  }

  // ── FOCUS Report (Form X-17A-5) ───────────────────────────────────────────

  generateFocusReport(input: FocusReportInput): FocusReport {
    const totalAssets =
      input.cashAndReceivables +
      input.securitiesOwned +
      input.otherAssets;

    const totalLiabilities =
      input.payablesToCustomers +
      input.payablesToBrokersDealers +
      input.shortPositions +
      input.otherLiabilities;

    const totalRevenue =
      input.commissionsRevenue +
      input.principalTransactionsRevenue +
      input.investmentBankingRevenue +
      input.otherRevenue;

    const totalExpenses =
      input.compensationExpense +
      input.clearingExpense +
      input.otherExpenses;

    // SIPC assessment: 0.25% of assessable net revenue (commissions + principal transactions)
    const assessableRevenue = input.commissionsRevenue + input.principalTransactionsRevenue;
    const sipcRate = 0.0025;
    const sipcAssessment = assessableRevenue * sipcRate;

    const reportId = `FINRA-FOCUS-${Date.now()}-${String(++reportCounter).padStart(4, '0')}`;

    return {
      reportId,
      firmName: input.firmName,
      crdNumber: input.crdNumber,
      reportingPeriodEnd: input.reportingPeriodEnd,
      generatedAt: new Date().toISOString(),
      balanceSheet: {
        totalAssets,
        totalLiabilities,
        subordinatedLiabilities: input.subordinatedLiabilities,
        stockholdersEquity: input.stockholdersEquity,
      },
      incomeStatement: {
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
        revenueByCategory: {
          commissions: input.commissionsRevenue,
          principalTransactions: input.principalTransactionsRevenue,
          investmentBanking: input.investmentBankingRevenue,
          other: input.otherRevenue,
        },
      },
      netCapitalSummary: input.netCapitalResult ?? null,
      sipcAssessment: {
        assessableRevenue,
        sipcAssessmentRate: sipcRate,
        sipcAssessmentAmount: sipcAssessment,
      },
    };
  }

  // ── TRACE trade report summary ────────────────────────────────────────────

  generateTraceReport(summary: TradeReportSummary) {
    const totalTrades = summary.corporateBondTrades + summary.agencyBondTrades;
    const lateRate = totalTrades > 0 ? summary.lateReports / totalTrades : 0;
    const cancelRate = totalTrades > 0 ? summary.cancelledReports / totalTrades : 0;

    return {
      reportId: `FINRA-TRACE-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      ...summary,
      totalTrades,
      lateReportRate: lateRate,
      cancellationRate: cancelRate,
      timely_reporting_compliant: summary.complianceRate >= 0.999, // 99.9% threshold
      regulatoryNotes: [
        `TRACE requires bond trades reported within 15 minutes of execution.`,
        `Timely reporting rate: ${(summary.complianceRate * 100).toFixed(3)}%`,
        lateRate > 0.001 ? `WARNING: ${(lateRate * 100).toFixed(3)}% late report rate may trigger FINRA review.` : 'Reporting timelines are compliant.',
      ],
    };
  }

  // ── Rule reference ────────────────────────────────────────────────────────

  getRegulatoryReference() {
    return {
      netCapitalRule: 'SEC Rule 15c3-1 (Net Capital Rule)',
      minimumNetCapital: '$250,000 (most BDs) or prescribed ratio',
      standardMethod: 'Aggregate indebtedness ≤ 15:1',
      alternativeMethod: 'Net capital ≥ 2% of aggregate debit items',
      earlyWarning: '120% of minimum triggers notification to FINRA/SEC',
      focusReport: 'Form X-17A-5 (Part II) — quarterly for broker-dealers',
      sipcAssessmentRate: '0.25% of assessable revenue',
      traceReporting: 'FINRA Rule 6730: corporate/agency bonds reported within 15 minutes',
      catReporting: 'Consolidated Audit Trail — daily order event reporting',
      haircuts: HAIRCUTS,
    };
  }
}
