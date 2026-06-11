import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type AssetClass =
  | 'US_EQUITY'
  | 'INTL_EQUITY'
  | 'EMERGING_MARKETS'
  | 'FIXED_INCOME'
  | 'TIPS'
  | 'ALTERNATIVES'
  | 'REAL_ESTATE'
  | 'COMMODITIES'
  | 'CASH';

export type RiskProfile =
  | 'CONSERVATIVE'
  | 'MODERATE_CONSERVATIVE'
  | 'MODERATE'
  | 'MODERATE_AGGRESSIVE'
  | 'AGGRESSIVE';

export interface ModelPortfolio {
  modelId: string;
  name: string;
  riskProfile: RiskProfile;
  targetAllocation: Record<AssetClass, number>;   // must sum to 100
  description: string;
  maxDriftThresholdPct: number;                   // default drift threshold for this model
  expectedAnnualReturnPct: number;                // historical/projected
  expectedVolatilityPct: number;                  // annualized std dev
}

export interface Holding {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: string;
  currentPrice: string;
  marketValue: string;
  costBasis: string;
  unrealizedGainLoss: string;
  unrealizedGainLossPct: string;
  weight: string;                // pct of total portfolio
  purchaseDate: string;
}

export interface RoboAccount {
  accountId: string;
  customerId: string;
  modelPortfolioId: string;
  riskProfile: RiskProfile;
  driftThresholdPct: number;
  autoRebalanceEnabled: boolean;
  lastRebalancedAt: string | null;
  nextScheduledRebalance: string;
  enrolledAt: string;
  totalMarketValue: string;
  totalCostBasis: string;
  totalUnrealizedGainLoss: string;
  totalUnrealizedGainLossPct: string;
  holdings: Holding[];
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

export interface RebalancingTrade {
  tradeId: string;
  symbol: string;
  assetClass: AssetClass;
  action: 'BUY' | 'SELL';
  currentWeight: string;
  targetWeight: string;
  quantity: string;
  estimatedValue: string;
  rationale: string;
  estimatedTaxImpact: string;    // USD tax cost if positive gain realized on SELL
}

export interface RebalancingPlan {
  planId: string;
  accountId: string;
  generatedAt: string;
  reason: 'DRIFT' | 'SCHEDULED' | 'CASH_FLOW' | 'MANUAL';
  currentAllocation: Record<AssetClass, string>;  // current pct
  targetAllocation: Record<AssetClass, string>;   // target pct
  trades: RebalancingTrade[];
  estimatedTurnover: string;     // pct of portfolio
  estimatedTaxImpact: string;    // total tax cost
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED';
}

export interface TaxLossHarvestOpportunity {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: string;
  currentPrice: string;
  costBasis: string;
  unrealizedLoss: string;
  unrealizedLossPct: string;
  harvestValue: string;
  suggestedSubstitute: string;   // correlated ETF to maintain market exposure
  substituteDescription: string;
  washSaleRisk: boolean;         // within 30-day window
  estimatedTaxSavingAt20Pct: string;
  estimatedTaxSavingAt37Pct: string;
}

// ── Model Portfolios ──────────────────────────────────────────────────────────

const MODEL_PORTFOLIOS: ModelPortfolio[] = [
  {
    modelId: 'model-conservative',
    name: 'Conservative',
    riskProfile: 'CONSERVATIVE',
    targetAllocation: {
      US_EQUITY: 15, INTL_EQUITY: 5, EMERGING_MARKETS: 0,
      FIXED_INCOME: 50, TIPS: 15, ALTERNATIVES: 0,
      REAL_ESTATE: 5, COMMODITIES: 0, CASH: 10,
    },
    description: 'Capital preservation focus with minimal equity exposure',
    maxDriftThresholdPct: 5,
    expectedAnnualReturnPct: 4.5,
    expectedVolatilityPct: 5.5,
  },
  {
    modelId: 'model-moderate-conservative',
    name: 'Moderate Conservative',
    riskProfile: 'MODERATE_CONSERVATIVE',
    targetAllocation: {
      US_EQUITY: 25, INTL_EQUITY: 10, EMERGING_MARKETS: 0,
      FIXED_INCOME: 40, TIPS: 10, ALTERNATIVES: 5,
      REAL_ESTATE: 5, COMMODITIES: 0, CASH: 5,
    },
    description: 'Income-oriented with limited equity upside',
    maxDriftThresholdPct: 5,
    expectedAnnualReturnPct: 5.5,
    expectedVolatilityPct: 7.5,
  },
  {
    modelId: 'model-moderate',
    name: 'Moderate',
    riskProfile: 'MODERATE',
    targetAllocation: {
      US_EQUITY: 35, INTL_EQUITY: 15, EMERGING_MARKETS: 5,
      FIXED_INCOME: 25, TIPS: 5, ALTERNATIVES: 8,
      REAL_ESTATE: 5, COMMODITIES: 2, CASH: 0,
    },
    description: 'Balanced growth and income',
    maxDriftThresholdPct: 5,
    expectedAnnualReturnPct: 7.0,
    expectedVolatilityPct: 10.5,
  },
  {
    modelId: 'model-moderate-aggressive',
    name: 'Moderate Aggressive',
    riskProfile: 'MODERATE_AGGRESSIVE',
    targetAllocation: {
      US_EQUITY: 45, INTL_EQUITY: 20, EMERGING_MARKETS: 10,
      FIXED_INCOME: 15, TIPS: 0, ALTERNATIVES: 5,
      REAL_ESTATE: 5, COMMODITIES: 0, CASH: 0,
    },
    description: 'Growth-oriented with meaningful international exposure',
    maxDriftThresholdPct: 5,
    expectedAnnualReturnPct: 8.5,
    expectedVolatilityPct: 13.5,
  },
  {
    modelId: 'model-aggressive',
    name: 'Aggressive',
    riskProfile: 'AGGRESSIVE',
    targetAllocation: {
      US_EQUITY: 50, INTL_EQUITY: 20, EMERGING_MARKETS: 15,
      FIXED_INCOME: 5, TIPS: 0, ALTERNATIVES: 8,
      REAL_ESTATE: 0, COMMODITIES: 0, CASH: 2,
    },
    description: 'Maximum long-term capital appreciation',
    maxDriftThresholdPct: 5,
    expectedAnnualReturnPct: 10.0,
    expectedVolatilityPct: 18.0,
  },
];

// ETF substitution map for tax-loss harvesting (avoid wash sales)
const TLH_SUBSTITUTES: Record<string, { symbol: string; description: string }> = {
  'VTI':   { symbol: 'SCHB', description: 'Schwab US Broad Market ETF' },
  'SCHB':  { symbol: 'VTI',  description: 'Vanguard Total Stock Market ETF' },
  'SPY':   { symbol: 'IVV',  description: 'iShares Core S&P 500 ETF' },
  'IVV':   { symbol: 'VOO',  description: 'Vanguard S&P 500 ETF' },
  'VOO':   { symbol: 'SPY',  description: 'SPDR S&P 500 ETF' },
  'VEA':   { symbol: 'IEFA', description: 'iShares Core MSCI EAFE ETF' },
  'IEFA':  { symbol: 'VEA',  description: 'Vanguard FTSE Developed Markets ETF' },
  'VWO':   { symbol: 'IEMG', description: 'iShares Core MSCI Emerging Markets ETF' },
  'IEMG':  { symbol: 'VWO',  description: 'Vanguard FTSE Emerging Markets ETF' },
  'BND':   { symbol: 'AGG',  description: 'iShares Core US Aggregate Bond ETF' },
  'AGG':   { symbol: 'BND',  description: 'Vanguard Total Bond Market ETF' },
  'TIP':   { symbol: 'SCHP', description: 'Schwab US TIPS ETF' },
  'SCHP':  { symbol: 'TIP',  description: 'iShares TIPS Bond ETF' },
  'VNQ':   { symbol: 'SCHH', description: 'Schwab US REIT ETF' },
  'SCHH':  { symbol: 'VNQ',  description: 'Vanguard Real Estate ETF' },
};

// ── In-memory stores ──────────────────────────────────────────────────────────

const modelMap     = new Map<string, ModelPortfolio>(MODEL_PORTFOLIOS.map((m) => [m.modelId, m]));
const accountStore = new Map<string, RoboAccount>();
const planStore    = new Map<string, RebalancingPlan>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextRebalanceDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3); // quarterly by default
  return d.toISOString().split('T')[0]!;
}

function computeHoldingMetrics(holdings: Omit<Holding, 'marketValue' | 'unrealizedGainLoss' | 'unrealizedGainLossPct' | 'weight'>[], totalMV: Decimal): Holding[] {
  return holdings.map((h) => {
    const qty   = new Decimal(h.quantity);
    const price = new Decimal(h.currentPrice);
    const mv    = qty.times(price);
    const cb    = new Decimal(h.costBasis);
    const ugl   = mv.minus(cb);
    const uglPct = cb.isZero() ? new Decimal(0) : ugl.dividedBy(cb).times(100);
    const weight = totalMV.isZero() ? new Decimal(0) : mv.dividedBy(totalMV).times(100);
    return {
      ...h,
      marketValue:           mv.toFixed(2),
      unrealizedGainLoss:    ugl.toFixed(2),
      unrealizedGainLossPct: uglPct.toFixed(2),
      weight:                weight.toFixed(2),
    };
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class RoboAdvisorService {
  private readonly logger = new Logger(RoboAdvisorService.name);

  // ── Models ────────────────────────────────────────────────────────────────

  listModels(): ModelPortfolio[] {
    return [...modelMap.values()];
  }

  getModel(modelId: string): ModelPortfolio {
    const m = modelMap.get(modelId);
    if (!m) throw new NotFoundException(`Model portfolio ${modelId} not found`);
    return m;
  }

  // ── Account enrolment ─────────────────────────────────────────────────────

  enrollAccount(params: {
    customerId: string;
    modelPortfolioId: string;
    driftThresholdPct?: number;
    autoRebalanceEnabled?: boolean;
  }): RoboAccount {
    const model = this.getModel(params.modelPortfolioId);

    const account: RoboAccount = {
      accountId:                 uuidv4(),
      customerId:                params.customerId,
      modelPortfolioId:          params.modelPortfolioId,
      riskProfile:               model.riskProfile,
      driftThresholdPct:         params.driftThresholdPct ?? model.maxDriftThresholdPct,
      autoRebalanceEnabled:      params.autoRebalanceEnabled ?? true,
      lastRebalancedAt:          null,
      nextScheduledRebalance:    nextRebalanceDate(),
      enrolledAt:                new Date().toISOString(),
      totalMarketValue:          '0.00',
      totalCostBasis:            '0.00',
      totalUnrealizedGainLoss:   '0.00',
      totalUnrealizedGainLossPct: '0.00',
      holdings:                  [],
      status:                    'ACTIVE',
    };

    accountStore.set(account.accountId, account);
    this.logger.log(`Enrolled robo account ${account.accountId} on model ${model.name} (${model.riskProfile})`);
    return account;
  }

  getAccount(accountId: string): RoboAccount {
    const a = accountStore.get(accountId);
    if (!a) throw new NotFoundException(`Robo account ${accountId} not found`);
    return a;
  }

  // ── Holdings update ───────────────────────────────────────────────────────

  updateHoldings(accountId: string, rawHoldings: {
    symbol: string;
    name: string;
    assetClass: AssetClass;
    quantity: string;
    currentPrice: string;
    costBasis: string;
    purchaseDate: string;
  }[]): RoboAccount {
    const account = this.getAccount(accountId);

    // First pass: total market value
    const totalMV = rawHoldings.reduce((sum, h) => {
      return sum.plus(new Decimal(h.quantity).times(new Decimal(h.currentPrice)));
    }, new Decimal(0));

    account.holdings = computeHoldingMetrics(rawHoldings, totalMV);
    account.totalMarketValue = totalMV.toFixed(2);

    const totalCB = account.holdings.reduce(
      (sum, h) => sum.plus(new Decimal(h.costBasis)), new Decimal(0),
    );
    const totalUGL = totalMV.minus(totalCB);
    const totalUGLPct = totalCB.isZero()
      ? new Decimal(0)
      : totalUGL.dividedBy(totalCB).times(100);

    account.totalCostBasis            = totalCB.toFixed(2);
    account.totalUnrealizedGainLoss   = totalUGL.toFixed(2);
    account.totalUnrealizedGainLossPct = totalUGLPct.toFixed(2);

    accountStore.set(accountId, account);
    return account;
  }

  // ── Drift analysis ────────────────────────────────────────────────────────

  checkDrift(accountId: string): {
    accountId: string;
    isDriftThresholdBreached: boolean;
    driftThresholdPct: number;
    currentAllocation: Record<AssetClass, string>;
    targetAllocation: Record<AssetClass, string>;
    drift: Record<AssetClass, { actual: string; target: string; drift: string; breached: boolean }>;
  } {
    const account = this.getAccount(accountId);
    const model   = this.getModel(account.modelPortfolioId);
    const totalMV = new Decimal(account.totalMarketValue);

    // Current allocation by asset class
    const currentByClass: Record<string, Decimal> = {};
    for (const h of account.holdings) {
      currentByClass[h.assetClass] = (currentByClass[h.assetClass] ?? new Decimal(0))
        .plus(new Decimal(h.marketValue));
    }

    const drift: Record<string, { actual: string; target: string; drift: string; breached: boolean }> = {};
    let anyBreached = false;

    const ALL_CLASSES: AssetClass[] = [
      'US_EQUITY', 'INTL_EQUITY', 'EMERGING_MARKETS', 'FIXED_INCOME',
      'TIPS', 'ALTERNATIVES', 'REAL_ESTATE', 'COMMODITIES', 'CASH',
    ];

    const currentAlloc: Record<AssetClass, string> = {} as Record<AssetClass, string>;
    const targetAlloc:  Record<AssetClass, string> = {} as Record<AssetClass, string>;

    for (const ac of ALL_CLASSES) {
      const actualMV  = currentByClass[ac] ?? new Decimal(0);
      const actualPct = totalMV.isZero() ? new Decimal(0) : actualMV.dividedBy(totalMV).times(100);
      const targetPct = new Decimal(model.targetAllocation[ac] ?? 0);
      const driftPct  = actualPct.minus(targetPct);
      const breached  = driftPct.abs().gte(new Decimal(account.driftThresholdPct));

      currentAlloc[ac] = actualPct.toFixed(2);
      targetAlloc[ac]  = targetPct.toFixed(2);
      drift[ac] = {
        actual:   actualPct.toFixed(2),
        target:   targetPct.toFixed(2),
        drift:    driftPct.toFixed(2),
        breached,
      };

      if (breached) anyBreached = true;
    }

    return {
      accountId,
      isDriftThresholdBreached: anyBreached,
      driftThresholdPct:        account.driftThresholdPct,
      currentAllocation:        currentAlloc,
      targetAllocation:         targetAlloc,
      drift:                    drift as Record<AssetClass, { actual: string; target: string; drift: string; breached: boolean }>,
    };
  }

  // ── Rebalancing ───────────────────────────────────────────────────────────

  generateRebalancingPlan(
    accountId: string,
    reason: RebalancingPlan['reason'] = 'MANUAL',
  ): RebalancingPlan {
    const account = this.getAccount(accountId);
    const model   = this.getModel(account.modelPortfolioId);
    const totalMV = new Decimal(account.totalMarketValue);

    if (totalMV.isZero()) {
      throw new BadRequestException('Account has no holdings — cannot generate rebalancing plan');
    }

    const driftResult = this.checkDrift(accountId);

    // Group holdings by asset class
    const holdingsByClass: Record<string, Holding[]> = {};
    for (const h of account.holdings) {
      if (!holdingsByClass[h.assetClass]) holdingsByClass[h.assetClass] = [];
      holdingsByClass[h.assetClass]!.push(h);
    }

    const trades: RebalancingTrade[] = [];
    let totalTurnover  = new Decimal(0);
    let totalTaxImpact = new Decimal(0);

    const ALL_CLASSES: AssetClass[] = [
      'US_EQUITY', 'INTL_EQUITY', 'EMERGING_MARKETS', 'FIXED_INCOME',
      'TIPS', 'ALTERNATIVES', 'REAL_ESTATE', 'COMMODITIES', 'CASH',
    ];

    for (const ac of ALL_CLASSES) {
      const targetPct = new Decimal(model.targetAllocation[ac] ?? 0);
      const actualPct = new Decimal(driftResult.currentAllocation[ac] ?? 0);
      const driftPct  = actualPct.minus(targetPct);

      if (driftPct.abs().lt(new Decimal(account.driftThresholdPct))) continue;

      const targetValue  = totalMV.times(targetPct.dividedBy(100));
      const currentValue = totalMV.times(actualPct.dividedBy(100));
      const tradeDelta   = targetValue.minus(currentValue); // positive = BUY, negative = SELL

      // Representative ETF for the asset class (first holding, or placeholder)
      const classHoldings = holdingsByClass[ac] ?? [];
      const symbol  = classHoldings[0]?.symbol ?? `${ac}-ETF`;
      const price   = classHoldings[0]?.currentPrice ?? '100';
      const priceD  = new Decimal(price);
      const quantity = tradeDelta.abs().dividedBy(priceD);

      let taxImpact = new Decimal(0);
      if (tradeDelta.lt(0) && classHoldings[0]) {
        // Selling — check for unrealized gain
        const gain = new Decimal(classHoldings[0].unrealizedGainLoss);
        if (gain.gt(0)) {
          // Estimate tax at 20% long-term capital gains
          taxImpact = gain.times(quantity.dividedBy(new Decimal(classHoldings[0].quantity))).times('0.20');
        }
      }

      const trade: RebalancingTrade = {
        tradeId:          uuidv4(),
        symbol,
        assetClass:       ac,
        action:           tradeDelta.gt(0) ? 'BUY' : 'SELL',
        currentWeight:    actualPct.toFixed(2),
        targetWeight:     targetPct.toFixed(2),
        quantity:         quantity.toFixed(4),
        estimatedValue:   tradeDelta.abs().toFixed(2),
        rationale:        `${ac} is ${driftPct.abs().toFixed(2)}% ${driftPct.gt(0) ? 'overweight' : 'underweight'} vs target`,
        estimatedTaxImpact: taxImpact.toFixed(2),
      };

      trades.push(trade);
      totalTurnover  = totalTurnover.plus(tradeDelta.abs());
      totalTaxImpact = totalTaxImpact.plus(taxImpact);
    }

    const turnoverPct = totalMV.isZero()
      ? new Decimal(0)
      : totalTurnover.dividedBy(totalMV).times(100);

    const currentAlloc: Record<AssetClass, string> = {} as Record<AssetClass, string>;
    const targetAlloc:  Record<AssetClass, string> = {} as Record<AssetClass, string>;
    for (const ac of ALL_CLASSES) {
      currentAlloc[ac] = driftResult.currentAllocation[ac] ?? '0.00';
      targetAlloc[ac]  = new Decimal(model.targetAllocation[ac] ?? 0).toFixed(2);
    }

    const plan: RebalancingPlan = {
      planId:             uuidv4(),
      accountId,
      generatedAt:        new Date().toISOString(),
      reason,
      currentAllocation:  currentAlloc,
      targetAllocation:   targetAlloc,
      trades,
      estimatedTurnover:  turnoverPct.toFixed(2),
      estimatedTaxImpact: totalTaxImpact.toFixed(2),
      status:             'PENDING',
    };

    planStore.set(plan.planId, plan);
    this.logger.log(
      `Rebalancing plan ${plan.planId} for account ${accountId}: ` +
      `${trades.length} trade(s), estimated turnover ${turnoverPct.toFixed(2)}%`,
    );
    return plan;
  }

  executePlan(accountId: string, planId: string): RebalancingPlan {
    const plan = planStore.get(planId);
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);
    if (plan.accountId !== accountId) {
      throw new BadRequestException(`Plan ${planId} does not belong to account ${accountId}`);
    }
    if (plan.status !== 'PENDING') {
      throw new BadRequestException(`Plan ${planId} is in status ${plan.status}, cannot execute`);
    }

    plan.status = 'EXECUTED';
    planStore.set(planId, plan);

    const account = this.getAccount(accountId);
    account.lastRebalancedAt     = new Date().toISOString();
    account.nextScheduledRebalance = nextRebalanceDate();
    accountStore.set(accountId, account);

    this.logger.log(`Rebalancing plan ${planId} executed for account ${accountId}`);
    return plan;
  }

  getRebalancingPlans(accountId: string): RebalancingPlan[] {
    return [...planStore.values()].filter((p) => p.accountId === accountId);
  }

  // ── Tax-loss harvesting ────────────────────────────────────────────────────

  getTaxLossHarvestOpportunities(accountId: string): TaxLossHarvestOpportunity[] {
    const account = this.getAccount(accountId);
    const MIN_LOSS_ABS  = new Decimal('1000');   // only harvest > $1,000 loss
    const MIN_LOSS_PCT  = new Decimal('2');      // only harvest > 2% unrealized loss

    const opportunities: TaxLossHarvestOpportunity[] = [];
    const today = new Date();

    for (const h of account.holdings) {
      const ugl = new Decimal(h.unrealizedGainLoss);
      if (ugl.gte(0)) continue; // only losses

      const lossAbs = ugl.abs();
      const lossPct = new Decimal(h.unrealizedGainLossPct).abs();

      if (lossAbs.lt(MIN_LOSS_ABS) && lossPct.lt(MIN_LOSS_PCT)) continue;

      // Check wash-sale risk: if purchased within last 30 days or 30 days after sale
      const purchase    = new Date(h.purchaseDate);
      const daysSincePurchase = Math.floor((today.getTime() - purchase.getTime()) / 86_400_000);
      const washSaleRisk = daysSincePurchase < 30;

      const substitute = TLH_SUBSTITUTES[h.symbol.toUpperCase()] ?? {
        symbol:      `${h.symbol}-SUB`,
        description: `Correlated substitute for ${h.symbol}`,
      };

      const taxSaving20 = lossAbs.times('0.20');
      const taxSaving37 = lossAbs.times('0.37');

      opportunities.push({
        symbol:                   h.symbol,
        name:                     h.name,
        assetClass:               h.assetClass,
        quantity:                 h.quantity,
        currentPrice:             h.currentPrice,
        costBasis:                h.costBasis,
        unrealizedLoss:           ugl.toFixed(2),
        unrealizedLossPct:        new Decimal(h.unrealizedGainLossPct).toFixed(2),
        harvestValue:             lossAbs.toFixed(2),
        suggestedSubstitute:      substitute.symbol,
        substituteDescription:    substitute.description,
        washSaleRisk,
        estimatedTaxSavingAt20Pct: taxSaving20.toFixed(2),
        estimatedTaxSavingAt37Pct: taxSaving37.toFixed(2),
      });
    }

    // Sort by harvest value descending
    return opportunities.sort((a, b) =>
      new Decimal(b.harvestValue).minus(new Decimal(a.harvestValue)).toNumber(),
    );
  }

  // ── Performance summary ───────────────────────────────────────────────────

  getPerformanceSummary(accountId: string): {
    accountId: string;
    totalMarketValue: string;
    totalCostBasis: string;
    totalUnrealizedGainLoss: string;
    totalUnrealizedGainLossPct: string;
    modelName: string;
    riskProfile: RiskProfile;
    expectedAnnualReturnPct: number;
    expectedVolatilityPct: number;
    allocationDrift: Record<AssetClass, { actual: string; target: string; drift: string }>;
    holdingsCount: number;
    lastRebalancedAt: string | null;
    nextScheduledRebalance: string;
  } {
    const account = this.getAccount(accountId);
    const model   = this.getModel(account.modelPortfolioId);
    const drift   = this.checkDrift(accountId);

    const allocationDrift: Record<AssetClass, { actual: string; target: string; drift: string }> =
      {} as Record<AssetClass, { actual: string; target: string; drift: string }>;

    for (const [ac, d] of Object.entries(drift.drift)) {
      allocationDrift[ac as AssetClass] = {
        actual: d.actual,
        target: d.target,
        drift:  d.drift,
      };
    }

    return {
      accountId,
      totalMarketValue:          account.totalMarketValue,
      totalCostBasis:            account.totalCostBasis,
      totalUnrealizedGainLoss:   account.totalUnrealizedGainLoss,
      totalUnrealizedGainLossPct: account.totalUnrealizedGainLossPct,
      modelName:                 model.name,
      riskProfile:               model.riskProfile,
      expectedAnnualReturnPct:   model.expectedAnnualReturnPct,
      expectedVolatilityPct:     model.expectedVolatilityPct,
      allocationDrift,
      holdingsCount:             account.holdings.length,
      lastRebalancedAt:          account.lastRebalancedAt,
      nextScheduledRebalance:    account.nextScheduledRebalance,
    };
  }
}
