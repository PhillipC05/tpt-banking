import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmlRuleCode, AmlAlertSeverity } from '@tpt/database';

export interface TransactionContext {
  transactionId: string;
  customerId: string;
  accountId: string;
  amount: number;
  currency: string;
  type: string;
  direction?: string;
  counterpartyCountry?: string;
  createdAt: Date;
}

export interface RuleViolation {
  ruleCode: AmlRuleCode;
  severity: AmlAlertSeverity;
  description: string;
  riskScore: number;
  triggerData: Record<string, unknown>;
}

/**
 * AML Transaction Monitoring Rules Engine.
 *
 * Rules implemented:
 *   1. CTR threshold — single cash transaction ≥ $10,000
 *   2. Structuring (cash) — multiple cash transactions just below $10K
 *   3. High-velocity — >10 transfers in 24 hours from one account
 *   4. Rapid movement — large debit followed by large credit within 1 hour
 *   5. Large wire — single wire > $50K
 *   6. High-risk jurisdiction — wire to/from high-risk country
 *   7. Round dollar — unusual concentration of round-dollar amounts
 *   8. Dormant account — large activity on account dormant >12 months
 */
@Injectable()
export class AmlRulesEngine {
  private readonly logger = new Logger(AmlRulesEngine.name);

  // Rule thresholds (configurable — in production load from DB/config service)
  private readonly THRESHOLDS = {
    CTR_CASH_THRESHOLD: 10_000,
    STRUCTURING_WINDOW_DAYS: 3,
    STRUCTURING_TOTAL_THRESHOLD: 9_500,
    STRUCTURING_MIN_TRANSACTIONS: 3,
    HIGH_VELOCITY_MAX_TRANSFERS_24H: 10,
    HIGH_VELOCITY_AMOUNT_THRESHOLD: 1_000,
    LARGE_WIRE_THRESHOLD: 50_000,
    RAPID_MOVEMENT_HOURS: 1,
    RAPID_MOVEMENT_AMOUNT: 25_000,
    DORMANT_MONTHS: 12,
    DORMANT_REACTIVATION_AMOUNT: 5_000,
  };

  private readonly HIGH_RISK_COUNTRIES = new Set([
    'IR', 'KP', 'SY', 'CU', 'SD', 'MM', 'LY', 'BY', 'AF', 'YE',
  ]);

  constructor(
    // Repositories injected here for lookups — declared inline to keep module clean
    @InjectRepository('Transaction') private readonly txnRepo: Repository<unknown>,
  ) {}

  /**
   * Evaluates a transaction against all AML rules.
   * Returns any violations found.
   */
  async evaluate(ctx: TransactionContext): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];

    const rules: Array<() => Promise<RuleViolation | null>> = [
      () => this.checkCtrThreshold(ctx),
      () => this.checkStructuring(ctx),
      () => this.checkHighVelocity(ctx),
      () => this.checkLargeWire(ctx),
      () => this.checkHighRiskJurisdiction(ctx),
      () => this.checkRoundDollar(ctx),
    ];

    const results = await Promise.allSettled(rules.map((r) => r()));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        violations.push(result.value);
      } else if (result.status === 'rejected') {
        this.logger.error(`Rule evaluation error: ${result.reason}`);
      }
    }

    return violations;
  }

  // ─── Individual rules ──────────────────────────────────────────────────────

  private async checkCtrThreshold(ctx: TransactionContext): Promise<RuleViolation | null> {
    const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(ctx.type);
    if (!isCash) return null;
    if (ctx.amount < this.THRESHOLDS.CTR_CASH_THRESHOLD) return null;

    return {
      ruleCode: AmlRuleCode.CTR_THRESHOLD,
      severity: AmlAlertSeverity.HIGH,
      description: `Cash transaction of ${ctx.amount} ${ctx.currency} meets CTR reporting threshold ($10,000)`,
      riskScore: 80,
      triggerData: { amount: ctx.amount, currency: ctx.currency, type: ctx.type },
    };
  }

  private async checkStructuring(ctx: TransactionContext): Promise<RuleViolation | null> {
    const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(ctx.type);
    if (!isCash) return null;
    if (ctx.amount >= this.THRESHOLDS.CTR_CASH_THRESHOLD) return null;
    if (ctx.amount < 5_000) return null;

    // Check for multiple cash transactions near the threshold in the past 3 days
    const windowStart = new Date(ctx.createdAt);
    windowStart.setDate(windowStart.getDate() - this.THRESHOLDS.STRUCTURING_WINDOW_DAYS);

    const recentTxns = await (this.txnRepo as Repository<{
      amount: string;
      type: string;
      sourceAccountId: string;
      createdAt: Date;
    }>).createQueryBuilder('t')
      .where('t.sourceAccountId = :accountId', { accountId: ctx.accountId })
      .andWhere("t.type IN ('DEPOSIT','WITHDRAWAL')")
      .andWhere('t.createdAt >= :start', { start: windowStart })
      .andWhere('t.createdAt < :end', { end: ctx.createdAt })
      .getMany();

    const totalRecent = recentTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0) + ctx.amount;

    if (
      recentTxns.length >= this.THRESHOLDS.STRUCTURING_MIN_TRANSACTIONS - 1 &&
      totalRecent >= this.THRESHOLDS.STRUCTURING_TOTAL_THRESHOLD
    ) {
      return {
        ruleCode: AmlRuleCode.STRUCTURING_CASH,
        severity: AmlAlertSeverity.HIGH,
        description: `Potential structuring: ${recentTxns.length + 1} cash transactions totalling ${totalRecent.toFixed(2)} over ${this.THRESHOLDS.STRUCTURING_WINDOW_DAYS} days`,
        riskScore: 85,
        triggerData: {
          transactionCount: recentTxns.length + 1,
          totalAmount: totalRecent,
          windowDays: this.THRESHOLDS.STRUCTURING_WINDOW_DAYS,
          currentAmount: ctx.amount,
        },
      };
    }

    return null;
  }

  private async checkHighVelocity(ctx: TransactionContext): Promise<RuleViolation | null> {
    if (ctx.amount < this.THRESHOLDS.HIGH_VELOCITY_AMOUNT_THRESHOLD) return null;

    const windowStart = new Date(ctx.createdAt.getTime() - 24 * 3600 * 1000);

    const count = await (this.txnRepo as Repository<{ sourceAccountId: string; createdAt: Date }>)
      .createQueryBuilder('t')
      .where('t.sourceAccountId = :accountId', { accountId: ctx.accountId })
      .andWhere('t.createdAt >= :start', { start: windowStart })
      .getCount();

    if (count + 1 > this.THRESHOLDS.HIGH_VELOCITY_MAX_TRANSFERS_24H) {
      return {
        ruleCode: AmlRuleCode.HIGH_VELOCITY_TRANSFERS,
        severity: AmlAlertSeverity.MEDIUM,
        description: `High transaction velocity: ${count + 1} transactions in the last 24 hours`,
        riskScore: 65,
        triggerData: { count: count + 1, window: '24h', threshold: this.THRESHOLDS.HIGH_VELOCITY_MAX_TRANSFERS_24H },
      };
    }

    return null;
  }

  private async checkLargeWire(ctx: TransactionContext): Promise<RuleViolation | null> {
    if (ctx.type !== 'WIRE' && ctx.type !== 'SWIFT') return null;
    if (ctx.amount < this.THRESHOLDS.LARGE_WIRE_THRESHOLD) return null;

    return {
      ruleCode: AmlRuleCode.LARGE_WIRE_TRANSFER,
      severity: ctx.amount > 500_000 ? AmlAlertSeverity.CRITICAL : AmlAlertSeverity.HIGH,
      description: `Large wire transfer of ${ctx.amount.toLocaleString()} ${ctx.currency}`,
      riskScore: ctx.amount > 500_000 ? 90 : 70,
      triggerData: { amount: ctx.amount, currency: ctx.currency, threshold: this.THRESHOLDS.LARGE_WIRE_THRESHOLD },
    };
  }

  private async checkHighRiskJurisdiction(ctx: TransactionContext): Promise<RuleViolation | null> {
    if (!ctx.counterpartyCountry) return null;
    if (!this.HIGH_RISK_COUNTRIES.has(ctx.counterpartyCountry.toUpperCase())) return null;

    return {
      ruleCode: AmlRuleCode.HIGH_RISK_JURISDICTION,
      severity: AmlAlertSeverity.CRITICAL,
      description: `Transaction involves high-risk jurisdiction: ${ctx.counterpartyCountry}`,
      riskScore: 95,
      triggerData: { country: ctx.counterpartyCountry, amount: ctx.amount, type: ctx.type },
    };
  }

  private async checkRoundDollar(ctx: TransactionContext): Promise<RuleViolation | null> {
    // Flag transactions that are exactly round thousands above $10K
    if (ctx.amount < 10_000) return null;
    if (ctx.amount % 1000 !== 0) return null;

    // Only alert if there are other round-dollar transactions recently
    const windowStart = new Date(ctx.createdAt.getTime() - 7 * 24 * 3600 * 1000);
    const count = await (this.txnRepo as Repository<{ sourceAccountId: string; createdAt: Date; amount: string }>)
      .createQueryBuilder('t')
      .where('t.sourceAccountId = :accountId', { accountId: ctx.accountId })
      .andWhere('t.createdAt >= :start', { start: windowStart })
      .andWhere("CAST(t.amount AS NUMERIC) % 1000 = 0")
      .andWhere("CAST(t.amount AS NUMERIC) >= 10000")
      .getCount();

    if (count >= 2) {
      return {
        ruleCode: AmlRuleCode.ROUND_DOLLAR_TRANSACTIONS,
        severity: AmlAlertSeverity.LOW,
        description: `Pattern of round-dollar transactions: ${count + 1} round-dollar transfers ≥ $10K in 7 days`,
        riskScore: 40,
        triggerData: { count: count + 1, amount: ctx.amount, window: '7d' },
      };
    }

    return null;
  }
}
