import { Injectable } from '@nestjs/common';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface RiskFactorShock {
  /** e.g. 'EQUITY_SPX', 'RATE_10Y', 'FX_EURUSD', 'CREDIT_IG_SPREAD' */
  factor: string;
  /** Absolute change (e.g. +0.02 = +200bps) or relative (e.g. -0.30 = -30%) */
  shockAbsolute?: number;
  shockRelative?: number;
}

export interface PortfolioExposure {
  factor: string;
  /** Dollar sensitivity: P&L change per unit change in this risk factor */
  dollarSensitivity: number;
  /** Current market value attributed to this factor */
  marketValue?: number;
}

export interface StressTestResult {
  scenarioName: string;
  scenarioDescription: string;
  totalPnL: number;
  pnlByFactor: Array<{ factor: string; pnl: number; shock: number }>;
  portfolioValueBefore: number;
  portfolioValueAfter: number;
  pnlPct: number;
  severityRating: 'MILD' | 'MODERATE' | 'SEVERE' | 'EXTREME';
}

export interface CustomStressParams {
  scenarioName: string;
  scenarioDescription: string;
  shocks: RiskFactorShock[];
  exposures: PortfolioExposure[];
  portfolioValue: number;
}

export interface CcarStressParams {
  /** CCAR scenario: 'SEVERELY_ADVERSE' | 'ADVERSE' | 'BASELINE' */
  scenario: 'SEVERELY_ADVERSE' | 'ADVERSE' | 'BASELINE';
  exposures: PortfolioExposure[];
  portfolioValue: number;
}

export interface BatchStressResult {
  results: StressTestResult[];
  worstScenario: StressTestResult;
  averagePnL: number;
  scenarioCount: number;
}

// ── CCAR 2024 scenario definitions (Federal Reserve Annual Stress Test) ──────
//
// Source: Board of Governors, "2024 Stress Test Scenarios" (Feb 2024)
// Severely Adverse: severe global recession, 50%+ equity drop, 6.5pp unemployment rise,
// commercial RE crash, widening credit spreads.

type ScenarioShockMap = { [factor: string]: { absolute?: number; relative?: number; description: string } };

const CCAR_SCENARIOS: Record<string, { name: string; description: string; shocks: ScenarioShockMap }> = {
  SEVERELY_ADVERSE: {
    name: 'CCAR 2024 — Severely Adverse',
    description:
      'Severe global recession: US unemployment rises ~6.5pp to ~10%, GDP falls ~8.5%, ' +
      'equities fall ~55%, CRE prices drop ~40%, short-term rates near zero, ' +
      'corporate spreads widen ~500bps (HY) / ~200bps (IG).',
    shocks: {
      EQUITY_SPX:            { relative: -0.55,   description: 'S&P 500 -55%' },
      EQUITY_VIX:            { absolute: +0.40,   description: 'VIX +40 pts (to ~65)' },
      EQUITY_INTL_DM:        { relative: -0.50,   description: 'International DM equities -50%' },
      EQUITY_EM:             { relative: -0.60,   description: 'EM equities -60%' },
      RATE_3M:               { absolute: -0.025,  description: '3M T-bill rate to ~0% (down ~250bps)' },
      RATE_5Y:               { absolute: -0.015,  description: '5Y Treasury -150bps' },
      RATE_10Y:              { absolute: -0.010,  description: '10Y Treasury -100bps' },
      RATE_30Y:              { absolute: +0.005,  description: '30Y Treasury +50bps (steepening)' },
      CREDIT_IG_SPREAD:      { absolute: +0.0200, description: 'IG OAS +200bps' },
      CREDIT_HY_SPREAD:      { absolute: +0.0500, description: 'HY OAS +500bps' },
      CREDIT_CRE_SPREAD:     { absolute: +0.0300, description: 'CRE spread +300bps' },
      CRE_PRICE:             { relative: -0.40,   description: 'Commercial RE prices -40%' },
      RESIDENTIAL_RE_PRICE:  { relative: -0.25,   description: 'Residential RE -25%' },
      FX_USD_BROAD:          { relative: +0.10,   description: 'USD strengthens +10% (broad)' },
      COMMODITY_OIL_WTI:     { relative: -0.45,   description: 'WTI crude -45%' },
      COMMODITY_GOLD:        { relative: +0.15,   description: 'Gold +15% (flight to safety)' },
    },
  },
  ADVERSE: {
    name: 'CCAR 2024 — Adverse',
    description:
      'Moderate recession: unemployment rises ~3.5pp, GDP falls ~4%, equities -35%, ' +
      'credit spreads widen moderately, rates mixed.',
    shocks: {
      EQUITY_SPX:            { relative: -0.35,   description: 'S&P 500 -35%' },
      EQUITY_VIX:            { absolute: +0.20,   description: 'VIX +20 pts' },
      EQUITY_INTL_DM:        { relative: -0.30,   description: 'International DM equities -30%' },
      EQUITY_EM:             { relative: -0.35,   description: 'EM equities -35%' },
      RATE_3M:               { absolute: -0.010,  description: '3M T-bill -100bps' },
      RATE_5Y:               { absolute: -0.005,  description: '5Y Treasury -50bps' },
      RATE_10Y:              { absolute: +0.005,  description: '10Y Treasury +50bps' },
      RATE_30Y:              { absolute: +0.015,  description: '30Y Treasury +150bps' },
      CREDIT_IG_SPREAD:      { absolute: +0.0100, description: 'IG OAS +100bps' },
      CREDIT_HY_SPREAD:      { absolute: +0.0250, description: 'HY OAS +250bps' },
      CRE_PRICE:             { relative: -0.20,   description: 'Commercial RE prices -20%' },
      RESIDENTIAL_RE_PRICE:  { relative: -0.10,   description: 'Residential RE -10%' },
      FX_USD_BROAD:          { relative: +0.05,   description: 'USD strengthens +5%' },
      COMMODITY_OIL_WTI:     { relative: -0.25,   description: 'WTI crude -25%' },
    },
  },
  BASELINE: {
    name: 'CCAR 2024 — Baseline',
    description:
      'Consensus forecast scenario: moderate growth, gradual rate normalisation, stable credit spreads.',
    shocks: {
      EQUITY_SPX:       { relative: +0.05,   description: 'S&P 500 +5% (baseline growth)' },
      RATE_10Y:         { absolute: -0.005,  description: '10Y Treasury -50bps (rate cuts)' },
      RATE_3M:          { absolute: -0.015,  description: '3M T-bill -150bps (policy easing)' },
      CREDIT_IG_SPREAD: { absolute: -0.0010, description: 'IG OAS -10bps (spread compression)' },
      FX_USD_BROAD:     { relative: -0.02,   description: 'USD weakens slightly -2%' },
    },
  },
};

// Additional pre-defined historical/hypothetical scenarios
const HISTORICAL_SCENARIOS: ScenarioShockMap[] = [];

@Injectable()
export class StressTestingService {

  // ── Custom scenario ───────────────────────────────────────────────────────

  runCustomScenario(params: CustomStressParams): StressTestResult {
    return this.applyShocks(
      params.scenarioName,
      params.scenarioDescription,
      params.shocks,
      params.exposures,
      params.portfolioValue,
    );
  }

  // ── CCAR regulatory scenario ──────────────────────────────────────────────

  runCcarScenario(params: CcarStressParams): StressTestResult {
    const scenario = CCAR_SCENARIOS[params.scenario];
    const shocks: RiskFactorShock[] = Object.entries(scenario.shocks).map(([factor, s]) => ({
      factor,
      shockAbsolute: s.absolute,
      shockRelative: s.relative,
    }));
    return this.applyShocks(
      scenario.name,
      scenario.description,
      shocks,
      params.exposures,
      params.portfolioValue,
    );
  }

  // ── Run all three CCAR scenarios ──────────────────────────────────────────

  runAllCcarScenarios(
    exposures: PortfolioExposure[],
    portfolioValue: number,
  ): BatchStressResult {
    const scenarios: Array<'SEVERELY_ADVERSE' | 'ADVERSE' | 'BASELINE'> = [
      'SEVERELY_ADVERSE', 'ADVERSE', 'BASELINE',
    ];
    const results = scenarios.map((s) =>
      this.runCcarScenario({ scenario: s, exposures, portfolioValue }),
    );
    return this.buildBatchResult(results);
  }

  // ── Run multiple custom scenarios in batch ────────────────────────────────

  runBatch(scenarios: CustomStressParams[]): BatchStressResult {
    const results = scenarios.map((s) => this.runCustomScenario(s));
    return this.buildBatchResult(results);
  }

  // ── Get available CCAR scenario definitions ───────────────────────────────

  getCcarScenarioDefinitions() {
    return Object.entries(CCAR_SCENARIOS).map(([key, s]) => ({
      scenarioKey: key,
      name: s.name,
      description: s.description,
      factors: Object.entries(s.shocks).map(([factor, shock]) => ({
        factor,
        shock: shock.absolute !== undefined ? `${(shock.absolute * 10000).toFixed(0)}bps` : `${((shock.relative ?? 0) * 100).toFixed(1)}%`,
        description: shock.description,
      })),
    }));
  }

  // ── Core shock application logic ──────────────────────────────────────────

  private applyShocks(
    scenarioName: string,
    scenarioDescription: string,
    shocks: RiskFactorShock[],
    exposures: PortfolioExposure[],
    portfolioValue: number,
  ): StressTestResult {
    // Build shock lookup
    const shockMap = new Map<string, RiskFactorShock>(shocks.map((s) => [s.factor, s]));

    // Compute effective shock size per factor (unify absolute vs relative)
    const pnlByFactor: Array<{ factor: string; pnl: number; shock: number }> = [];

    let totalPnL = 0;
    for (const exposure of exposures) {
      const shock = shockMap.get(exposure.factor);
      if (!shock) continue;

      // Determine effective shock size
      let effectiveShock: number;
      if (shock.shockAbsolute !== undefined) {
        effectiveShock = shock.shockAbsolute;
      } else if (shock.shockRelative !== undefined && exposure.marketValue !== undefined) {
        effectiveShock = shock.shockRelative * exposure.marketValue;
      } else if (shock.shockRelative !== undefined) {
        // Treat relative shock as applied to the sensitivity directly
        effectiveShock = shock.shockRelative;
      } else {
        continue;
      }

      const pnl = exposure.dollarSensitivity * effectiveShock;
      pnlByFactor.push({ factor: exposure.factor, pnl, shock: effectiveShock });
      totalPnL += pnl;
    }

    const portfolioValueAfter = portfolioValue + totalPnL;
    const pnlPct = portfolioValue > 0 ? (totalPnL / portfolioValue) * 100 : 0;

    return {
      scenarioName,
      scenarioDescription,
      totalPnL,
      pnlByFactor: pnlByFactor.sort((a, b) => a.pnl - b.pnl), // worst losses first
      portfolioValueBefore: portfolioValue,
      portfolioValueAfter,
      pnlPct,
      severityRating: this.rateSeverity(pnlPct),
    };
  }

  private rateSeverity(pnlPct: number): 'MILD' | 'MODERATE' | 'SEVERE' | 'EXTREME' {
    const loss = -pnlPct;
    if (loss < 5) return 'MILD';
    if (loss < 15) return 'MODERATE';
    if (loss < 30) return 'SEVERE';
    return 'EXTREME';
  }

  private buildBatchResult(results: StressTestResult[]): BatchStressResult {
    const worst = results.reduce((a, b) => (a.totalPnL < b.totalPnL ? a : b));
    const avg = results.reduce((s, r) => s + r.totalPnL, 0) / results.length;
    return {
      results,
      worstScenario: worst,
      averagePnL: avg,
      scenarioCount: results.length,
    };
  }
}
