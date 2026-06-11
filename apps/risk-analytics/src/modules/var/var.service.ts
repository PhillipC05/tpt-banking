import { Injectable, Logger } from '@nestjs/common';
import { normInv, normPdf, mean, percentile, boxMuller, covariance, cholesky } from '../../lib/statistics';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface VarResult {
  var: number;
  cvar: number;
  confidenceLevel: number;
  holdingPeriodDays: number;
  portfolioValue: number;
  varPct: number;
  cvarPct: number;
}

export interface HistoricalVarParams {
  /** Array of historical daily P&L returns (absolute dollar changes) */
  historicalPnL: number[];
  confidenceLevel: number;
  holdingPeriodDays: number;
  portfolioValue: number;
}

export interface ParametricVarParams {
  portfolioValue: number;
  /** Annualised expected return */
  annualisedReturn: number;
  /** Annualised portfolio volatility */
  annualisedVolatility: number;
  confidenceLevel: number;
  holdingPeriodDays: number;
}

export interface PortfolioPosition {
  symbol: string;
  value: number;
  /** Annualised volatility of this position */
  annualisedVolatility: number;
  /** Historical daily log-returns for Monte Carlo */
  historicalReturns?: number[];
}

export interface MonteCarloVarParams {
  positions: PortfolioPosition[];
  /** Correlation matrix (n×n, matching positions order). If omitted, assumes zero correlation. */
  correlationMatrix?: number[][];
  confidenceLevel: number;
  holdingPeriodDays: number;
  numSimulations?: number;
}

export interface ComponentVaR {
  symbol: string;
  individualVar: number;
  componentVar: number;
  marginalVar: number;
  percentContribution: number;
}

export interface MonteCarloVarResult extends VarResult {
  simulationCount: number;
  componentVaR: ComponentVaR[];
  diversificationBenefit: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Value-at-Risk service implementing three methodologies:
 *
 *  1. Historical Simulation VaR — non-parametric, uses empirical P&L distribution
 *  2. Parametric (Variance-Covariance) VaR — assumes normal returns
 *  3. Monte Carlo VaR — GBM simulation with Cholesky-decomposed correlation
 *
 * All methods also compute CVaR (Expected Shortfall) = E[loss | loss > VaR].
 * VaR is expressed as a positive number (the loss amount).
 * Square-root-of-time scaling per Basel III for multi-day VaR.
 */
@Injectable()
export class VarService {
  private readonly logger = new Logger(VarService.name);

  // ── Historical Simulation ─────────────────────────────────────────────────

  historicalVar(params: HistoricalVarParams): VarResult {
    const { historicalPnL, confidenceLevel, holdingPeriodDays, portfolioValue } = params;
    if (historicalPnL.length < 30) {
      this.logger.warn('Historical VaR: fewer than 30 observations — results may be unreliable');
    }

    // Scale 1-day P&L to holding period via square-root-of-time
    const scale = Math.sqrt(holdingPeriodDays);
    const scaledPnL = historicalPnL.map((r) => r * scale);

    // VaR is the (1-confidenceLevel) quantile of the loss distribution
    const lossQuantile = 1 - confidenceLevel;
    const varValue = -percentile(scaledPnL, lossQuantile);

    // CVaR = mean of losses exceeding VaR
    const exceeding = scaledPnL.filter((v) => v < -varValue);
    const cvar = exceeding.length > 0
      ? -mean(exceeding)
      : varValue;

    return this.buildResult(varValue, cvar, confidenceLevel, holdingPeriodDays, portfolioValue);
  }

  // ── Parametric (Variance-Covariance) ─────────────────────────────────────

  parametricVar(params: ParametricVarParams): VarResult {
    const { portfolioValue, annualisedReturn, annualisedVolatility, confidenceLevel, holdingPeriodDays } = params;

    const dailyMean = annualisedReturn / 252;
    const dailyVol = annualisedVolatility / Math.sqrt(252);

    // Scale to holding period
    const hpMean = dailyMean * holdingPeriodDays;
    const hpVol = dailyVol * Math.sqrt(holdingPeriodDays);

    // z-score for one-tailed confidence level
    const z = normInv(confidenceLevel);

    // VaR in returns space: -(μ - z*σ) gives the loss
    const varReturn = -(hpMean - z * hpVol);
    const varValue = varReturn * portfolioValue;

    // CVaR for normal distribution: E[Z | Z > z] = φ(z)/(1-CL)
    const pdfZ = normPdf(z);
    const cvarReturn = hpVol * pdfZ / (1 - confidenceLevel) - hpMean;
    const cvar = Math.max(cvarReturn * portfolioValue, varValue);

    return this.buildResult(varValue, cvar, confidenceLevel, holdingPeriodDays, portfolioValue);
  }

  // ── Monte Carlo ───────────────────────────────────────────────────────────

  monteCarloVar(params: MonteCarloVarParams): MonteCarloVarResult {
    const {
      positions,
      correlationMatrix,
      confidenceLevel,
      holdingPeriodDays,
      numSimulations = 10_000,
    } = params;

    const n = positions.length;
    const portfolioValue = positions.reduce((s, p) => s + Math.abs(p.value), 0);
    const dailyVols = positions.map((p) => p.annualisedVolatility / Math.sqrt(252));
    const weights = positions.map((p) => p.value / portfolioValue);

    // Build correlation matrix (default: identity = no correlation)
    const corrMatrix = correlationMatrix ?? this.identityMatrix(n);

    // Build covariance matrix
    const covMatrix = this.buildCovMatrix(dailyVols, corrMatrix);

    // Cholesky decomposition for correlated sampling
    const L = cholesky(covMatrix);

    // Simulate portfolio P&L
    const portfolioPnL: number[] = [];
    const positionPnL: number[][] = Array.from({ length: n }, () => []);

    for (let sim = 0; sim < numSimulations; sim++) {
      // Generate n independent standard normal draws
      const z = this.sampleNormals(n);
      // Correlate via Cholesky: correlated returns = L * z
      const correlated = this.matMulVec(L, z);

      let totalReturn = 0;
      for (let i = 0; i < n; i++) {
        // GBM: return over holding period
        const ret = correlated[i] * Math.sqrt(holdingPeriodDays);
        const pnl = positions[i].value * ret;
        positionPnL[i].push(pnl);
        totalReturn += weights[i] * ret;
      }
      portfolioPnL.push(totalReturn * portfolioValue);
    }

    // Portfolio VaR and CVaR
    const lossQuantile = 1 - confidenceLevel;
    const varValue = -percentile(portfolioPnL, lossQuantile);
    const exceeding = portfolioPnL.filter((v) => v < -varValue);
    const cvar = exceeding.length > 0 ? -mean(exceeding) : varValue;

    // Component VaR per position
    const componentVaR = positions.map((pos, i) => {
      const posVar = -percentile(positionPnL[i], lossQuantile);
      const cov = this.sampleCovariance(positionPnL[i], portfolioPnL);
      const portVariance = this.variance(portfolioPnL);
      const marginalVar = cov / Math.sqrt(portVariance) * normInv(confidenceLevel);
      const compVar = weights[i] * marginalVar;
      return {
        symbol: pos.symbol,
        individualVar: posVar,
        componentVar: compVar,
        marginalVar,
        percentContribution: varValue > 0 ? (compVar / varValue) * 100 : 0,
      };
    });

    // Diversification benefit: sum of individual VaRs minus portfolio VaR
    const sumIndividual = componentVaR.reduce((s, c) => s + c.individualVar, 0);
    const diversificationBenefit = sumIndividual - varValue;

    const base = this.buildResult(varValue, cvar, confidenceLevel, holdingPeriodDays, portfolioValue);
    return { ...base, simulationCount: numSimulations, componentVaR, diversificationBenefit };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildResult(
    varValue: number,
    cvar: number,
    confidenceLevel: number,
    holdingPeriodDays: number,
    portfolioValue: number,
  ): VarResult {
    return {
      var: Math.max(varValue, 0),
      cvar: Math.max(cvar, 0),
      confidenceLevel,
      holdingPeriodDays,
      portfolioValue,
      varPct: portfolioValue > 0 ? (Math.max(varValue, 0) / portfolioValue) * 100 : 0,
      cvarPct: portfolioValue > 0 ? (Math.max(cvar, 0) / portfolioValue) * 100 : 0,
    };
  }

  private identityMatrix(n: number): number[][] {
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  }

  private buildCovMatrix(vols: number[], corr: number[][]): number[][] {
    const n = vols.length;
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => vols[i] * vols[j] * corr[i][j]),
    );
  }

  private sampleNormals(n: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < n; i += 2) {
      const [z0, z1] = boxMuller();
      result.push(z0);
      if (i + 1 < n) result.push(z1);
    }
    return result;
  }

  private matMulVec(L: number[][], z: number[]): number[] {
    return L.map((row) => row.reduce((s, v, j) => s + v * z[j], 0));
  }

  private sampleCovariance(xs: number[], ys: number[]): number {
    return covariance(xs, ys);
  }

  private variance(values: number[]): number {
    const m = mean(values);
    return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  }
}
