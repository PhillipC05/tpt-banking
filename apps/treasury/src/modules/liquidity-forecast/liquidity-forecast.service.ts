import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CashFlowCategory =
  | 'LOAN_REPAYMENT'
  | 'LOAN_DISBURSEMENT'
  | 'DEPOSIT_MATURITY'
  | 'DEPOSIT_INFLOW'
  | 'BOND_COUPON'
  | 'BOND_MATURITY'
  | 'DIVIDEND_PAYMENT'
  | 'FX_SETTLEMENT'
  | 'DERIVATIVE_SETTLEMENT'
  | 'OPERATING_EXPENSE'
  | 'REVENUE_INFLOW'
  | 'INTERBANK_BORROWING'
  | 'INTERBANK_LENDING'
  | 'CENTRAL_BANK_FACILITY'
  | 'OTHER';

export interface CashFlowEntry {
  id: string;
  category: CashFlowCategory;
  description: string;
  currency: string;
  amount: number;          // positive = inflow, negative = outflow
  valueDate: string;       // ISO date
  contractual: boolean;    // true = contractual cash flow; false = behavioural estimate
  confidence: number;      // 0–1, certainty of the cash flow
}

export interface DailyLiquidityPosition {
  date: string;
  openingBalance: number;
  scheduledInflows: number;
  scheduledOutflows: number;
  netFlow: number;
  closingBalance: number;
  cumulativeGap: number;
  warningLevel: 'GREEN' | 'AMBER' | 'RED';
}

export interface GapAnalysis {
  timeBucket: string;
  daysStart: number;
  daysEnd: number;
  assets: number;
  liabilities: number;
  gap: number;
  cumulativeGap: number;
  gapRatioPct: string;
}

export interface SurvivalDayResult {
  scenario: string;
  survivalDays: number;
  survivalDate: string;
  liquidityBuffer: number;
  dailyPositions: DailyLiquidityPosition[];
  earlyWarningIndicators: Array<{
    indicator: string;
    value: string;
    threshold: string;
    status: 'GREEN' | 'AMBER' | 'RED';
  }>;
}

// ── Gap analysis time buckets ─────────────────────────────────────────────────

const GAP_BUCKETS = [
  { label: 'Overnight',  daysStart: 0,   daysEnd: 1   },
  { label: '1D–7D',      daysStart: 1,   daysEnd: 7   },
  { label: '7D–1M',      daysStart: 7,   daysEnd: 30  },
  { label: '1M–3M',      daysStart: 30,  daysEnd: 90  },
  { label: '3M–6M',      daysStart: 90,  daysEnd: 180 },
  { label: '6M–1Y',      daysStart: 180, daysEnd: 360 },
  { label: '1Y–2Y',      daysStart: 360, daysEnd: 720 },
  { label: '2Y+',        daysStart: 720, daysEnd: Infinity },
];

@Injectable()
export class LiquidityForecastService {

  // ── Cash flow projection ──────────────────────────────────────────────────

  projectCashFlows(
    openingBalance: number,
    cashFlows: CashFlowEntry[],
    horizonDays: number,
  ): DailyLiquidityPosition[] {
    const today = new Date();
    const positions: DailyLiquidityPosition[] = [];
    let runningBalance = new Decimal(openingBalance);
    let cumulativeGap = new Decimal(0);

    for (let d = 0; d < horizonDays; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const dateStr = date.toISOString().split('T')[0]!;

      const dayFlows = cashFlows.filter((cf) => cf.valueDate === dateStr);
      const inflows = dayFlows
        .filter((cf) => cf.amount > 0)
        .reduce((s, cf) => s.plus(new Decimal(cf.amount).times(cf.confidence)), new Decimal(0));
      const outflows = dayFlows
        .filter((cf) => cf.amount < 0)
        .reduce((s, cf) => s.plus(new Decimal(cf.amount).times(cf.confidence)), new Decimal(0));

      const netFlow = inflows.plus(outflows);
      const openingForDay = runningBalance;
      runningBalance = runningBalance.plus(netFlow);
      cumulativeGap = cumulativeGap.plus(netFlow);

      const closingNum = runningBalance.toNumber();
      const warningLevel: 'GREEN' | 'AMBER' | 'RED' =
        closingNum < 0 ? 'RED' :
        closingNum < openingBalance * 0.10 ? 'AMBER' :
        'GREEN';

      positions.push({
        date: dateStr,
        openingBalance: openingForDay.toNumber(),
        scheduledInflows: inflows.toNumber(),
        scheduledOutflows: outflows.toNumber(),
        netFlow: netFlow.toNumber(),
        closingBalance: closingNum,
        cumulativeGap: cumulativeGap.toNumber(),
        warningLevel,
      });
    }

    return positions;
  }

  // ── Survival day analysis ─────────────────────────────────────────────────

  computeSurvivalDays(
    openingBalance: number,
    liquidityBuffer: number,        // HQLA + committed credit lines
    cashFlows: CashFlowEntry[],
    scenario: 'BASE' | 'STRESS' | 'SEVERE_STRESS',
    horizonDays = 90,
  ): SurvivalDayResult {
    // Apply scenario stress multipliers to outflows
    const stressMultiplier = scenario === 'BASE' ? 1.0 : scenario === 'STRESS' ? 1.25 : 1.60;
    const ingressMultiplier = scenario === 'BASE' ? 1.0 : scenario === 'STRESS' ? 0.80 : 0.50;

    const adjustedFlows = cashFlows.map((cf): CashFlowEntry => ({
      ...cf,
      amount: cf.amount < 0
        ? cf.amount * stressMultiplier
        : cf.amount * ingressMultiplier,
    }));

    const positions = this.projectCashFlows(
      openingBalance + liquidityBuffer,
      adjustedFlows,
      horizonDays,
    );

    const failDay = positions.find((p) => p.closingBalance < 0);
    const survivalDays = failDay
      ? positions.indexOf(failDay)
      : horizonDays;

    const survivalDate = new Date();
    survivalDate.setDate(survivalDate.getDate() + survivalDays);

    const ewi = this.computeEarlyWarningIndicators(openingBalance, liquidityBuffer, positions);

    return {
      scenario,
      survivalDays,
      survivalDate: survivalDate.toISOString().split('T')[0]!,
      liquidityBuffer,
      dailyPositions: positions,
      earlyWarningIndicators: ewi,
    };
  }

  private computeEarlyWarningIndicators(
    openingBalance: number,
    liquidityBuffer: number,
    positions: DailyLiquidityPosition[],
  ): SurvivalDayResult['earlyWarningIndicators'] {
    const day7  = positions[6];
    const day30 = positions[29];
    const day90 = positions[89];

    const total = openingBalance + liquidityBuffer;

    const ewi: SurvivalDayResult['earlyWarningIndicators'] = [];

    if (day7) {
      const ratio7 = day7.closingBalance / total;
      ewi.push({
        indicator: '7-Day Liquidity Coverage Ratio',
        value: `${(ratio7 * 100).toFixed(1)}%`,
        threshold: '20%',
        status: ratio7 < 0 ? 'RED' : ratio7 < 0.20 ? 'AMBER' : 'GREEN',
      });
    }

    if (day30) {
      const ratio30 = day30.closingBalance / total;
      ewi.push({
        indicator: '30-Day Liquidity Coverage',
        value: `${(ratio30 * 100).toFixed(1)}%`,
        threshold: '10%',
        status: ratio30 < 0 ? 'RED' : ratio30 < 0.10 ? 'AMBER' : 'GREEN',
      });
    }

    if (day90) {
      const ratio90 = day90.closingBalance / total;
      ewi.push({
        indicator: '90-Day Liquidity Outlook',
        value: `${(ratio90 * 100).toFixed(1)}%`,
        threshold: '5%',
        status: ratio90 < 0 ? 'RED' : ratio90 < 0.05 ? 'AMBER' : 'GREEN',
      });
    }

    // Largest single-day outflow
    const maxOutflow = Math.min(...positions.map((p) => p.scheduledOutflows));
    ewi.push({
      indicator: 'Peak Daily Outflow',
      value: maxOutflow.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
      threshold: `${(openingBalance * 0.15).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (15% of opening)`,
      status: Math.abs(maxOutflow) > openingBalance * 0.15 ? 'RED'
            : Math.abs(maxOutflow) > openingBalance * 0.08 ? 'AMBER'
            : 'GREEN',
    });

    return ewi;
  }

  // ── Gap analysis ──────────────────────────────────────────────────────────

  computeGapAnalysis(items: Array<{
    type: 'ASSET' | 'LIABILITY';
    amount: number;
    repriceDate?: string;   // ISO date — when the item reprices or matures
    maturityDate?: string;  // ISO date
  }>): GapAnalysis[] {
    const today = new Date();

    const buckets = GAP_BUCKETS.map((b) => ({ ...b, assets: 0, liabilities: 0 }));

    for (const item of items) {
      const refDate = item.repriceDate ?? item.maturityDate;
      if (!refDate) continue;
      const days = Math.max(0, Math.floor((new Date(refDate).getTime() - today.getTime()) / 86_400_000));
      const bucket = buckets.find((b) => days >= b.daysStart && days < b.daysEnd);
      if (!bucket) continue;
      if (item.type === 'ASSET') bucket.assets += item.amount;
      else bucket.liabilities += item.amount;
    }

    let cumulativeGap = 0;
    return buckets.map((b) => {
      const gap = b.assets - b.liabilities;
      cumulativeGap += gap;
      const denominator = b.assets + b.liabilities;
      return {
        timeBucket: b.label,
        daysStart: b.daysStart,
        daysEnd: b.daysEnd === Infinity ? 99999 : b.daysEnd,
        assets: b.assets,
        liabilities: b.liabilities,
        gap,
        cumulativeGap,
        gapRatioPct: denominator > 0 ? `${((gap / denominator) * 100).toFixed(2)}%` : 'N/A',
      };
    });
  }

  // ── Intraday liquidity monitoring ─────────────────────────────────────────

  computeIntradayPosition(
    openingBalance: number,
    payments: Array<{ time: string; amount: number; description: string }>,
  ): Array<{ time: string; balance: number; description: string; warningLevel: 'GREEN' | 'AMBER' | 'RED' }> {
    let balance = new Decimal(openingBalance);
    return payments
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((p) => {
        balance = balance.plus(p.amount);
        const bal = balance.toNumber();
        return {
          time: p.time,
          balance: bal,
          description: p.description,
          warningLevel: bal < 0 ? 'RED' : bal < openingBalance * 0.05 ? 'AMBER' : 'GREEN',
        };
      });
  }
}
