import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PoolType = 'PHYSICAL' | 'NOTIONAL';
export type PoolStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type SweepFrequency = 'INTRADAY' | 'EOD' | 'WEEKLY';

export interface PoolAccount {
  accountId: string;
  accountName: string;
  currency: string;
  currentBalance: number;
  targetBalance: number;     // zero-balance account target (0 for ZBA, or minimum floor)
  minBalance: number;        // regulatory or operational minimum
  isHeader: boolean;         // true = header account (master), false = sub-account
  participatesInSweep: boolean;
}

export interface CashPool {
  poolId: string;
  poolName: string;
  poolType: PoolType;
  status: PoolStatus;
  headerAccountId: string;   // master/header account
  currency: string;          // all accounts must be same currency for physical pooling
  sweepFrequency: SweepFrequency;
  interestRate: number;      // annualised interest rate on pooled balance (notional pooling)
  accounts: PoolAccount[];
  createdAt: string;
}

export interface SweepResult {
  poolId: string;
  sweepTimestamp: string;
  sweepType: 'PHYSICAL' | 'NOTIONAL';
  transfers: Array<{
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    direction: 'SWEEP_UP' | 'SWEEP_DOWN';
  }>;
  headerBalanceBefore: string;
  headerBalanceAfter: string;
  totalSweptUp: string;
  totalSweptDown: string;
}

export interface NotionalPoolSummary {
  poolId: string;
  notionalBalance: string;
  interestSaved: string;        // interest saved vs. individual accounts
  interestEarned: string;       // credit interest on positive notional balance
  interestCharged: string;      // debit interest on negative notional balance (before offset)
  netInterestBenefit: string;
  accountBreakdown: Array<{
    accountId: string;
    accountName: string;
    balance: string;
    interestAllocation: string;
  }>;
}

export interface InterestAllocation {
  poolId: string;
  period: string;
  totalInterest: string;
  allocations: Array<{
    accountId: string;
    accountName: string;
    averageBalance: string;
    interestAllocated: string;
  }>;
}

// ── In-memory store (replace with TypeORM in production) ─────────────────────

const poolStore = new Map<string, CashPool>();

@Injectable()
export class CashPoolingService {
  private readonly logger = new Logger(CashPoolingService.name);

  // ── Pool management ───────────────────────────────────────────────────────

  createPool(params: {
    poolName: string;
    poolType: PoolType;
    headerAccountId: string;
    currency: string;
    sweepFrequency: SweepFrequency;
    interestRate: number;
    accounts: Omit<PoolAccount, 'currentBalance'>[];
    initialBalances: Record<string, number>;
  }): CashPool {
    const poolId = uuidv4();
    const accounts: PoolAccount[] = params.accounts.map((a) => ({
      ...a,
      currentBalance: params.initialBalances[a.accountId] ?? 0,
    }));

    const pool: CashPool = {
      poolId,
      poolName: params.poolName,
      poolType: params.poolType,
      status: 'ACTIVE',
      headerAccountId: params.headerAccountId,
      currency: params.currency,
      sweepFrequency: params.sweepFrequency,
      interestRate: params.interestRate,
      accounts,
      createdAt: new Date().toISOString(),
    };

    poolStore.set(poolId, pool);
    this.logger.log(`Created ${params.poolType} cash pool: ${poolId} (${params.poolName})`);
    return pool;
  }

  getPool(poolId: string): CashPool {
    const pool = poolStore.get(poolId);
    if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
    return pool;
  }

  getAllPools(): CashPool[] {
    return [...poolStore.values()];
  }

  updateAccountBalance(poolId: string, accountId: string, newBalance: number): PoolAccount {
    const pool = this.getPool(poolId);
    const account = pool.accounts.find((a) => a.accountId === accountId);
    if (!account) throw new NotFoundException(`Account ${accountId} not found in pool ${poolId}`);
    account.currentBalance = newBalance;
    poolStore.set(poolId, pool);
    return account;
  }

  // ── Physical pooling: zero-balance sweeping ───────────────────────────────

  runPhysicalSweep(poolId: string): SweepResult {
    const pool = this.getPool(poolId);
    if (pool.poolType !== 'PHYSICAL') {
      throw new BadRequestException('Physical sweep only applies to PHYSICAL pools');
    }
    if (pool.status !== 'ACTIVE') {
      throw new BadRequestException(`Pool ${poolId} is not active`);
    }

    const headerAccount = pool.accounts.find((a) => a.accountId === pool.headerAccountId);
    if (!headerAccount) throw new NotFoundException('Header account not found in pool');

    const transfers: SweepResult['transfers'] = [];
    const headerBalanceBefore = new Decimal(headerAccount.currentBalance);
    let headerBalance = headerBalanceBefore;
    let totalSweptUp = new Decimal(0);
    let totalSweptDown = new Decimal(0);

    for (const account of pool.accounts) {
      if (account.accountId === pool.headerAccountId || !account.participatesInSweep) continue;

      const surplus = new Decimal(account.currentBalance).minus(account.targetBalance);

      if (surplus.greaterThan(0)) {
        // Sweep up: sub-account excess → header
        account.currentBalance = account.targetBalance;
        headerBalance = headerBalance.plus(surplus);
        totalSweptUp = totalSweptUp.plus(surplus);
        transfers.push({
          fromAccountId: account.accountId,
          toAccountId: pool.headerAccountId,
          amount: surplus.toFixed(2),
          direction: 'SWEEP_UP',
        });
      } else if (surplus.lessThan(0)) {
        // Sweep down: header funds → sub-account deficit
        const deficit = surplus.abs();
        const availableFromHeader = headerBalance.minus(headerAccount.minBalance);
        if (availableFromHeader.lessThanOrEqualTo(0)) continue;

        const sweepAmount = Decimal.min(deficit, availableFromHeader);
        account.currentBalance = new Decimal(account.currentBalance).plus(sweepAmount).toNumber();
        headerBalance = headerBalance.minus(sweepAmount);
        totalSweptDown = totalSweptDown.plus(sweepAmount);
        transfers.push({
          fromAccountId: pool.headerAccountId,
          toAccountId: account.accountId,
          amount: sweepAmount.toFixed(2),
          direction: 'SWEEP_DOWN',
        });
      }
    }

    headerAccount.currentBalance = headerBalance.toNumber();
    poolStore.set(poolId, pool);

    this.logger.log(`Physical sweep complete: pool=${poolId}, sweptUp=${totalSweptUp.toFixed(2)}, sweptDown=${totalSweptDown.toFixed(2)}`);

    return {
      poolId,
      sweepTimestamp: new Date().toISOString(),
      sweepType: 'PHYSICAL',
      transfers,
      headerBalanceBefore: headerBalanceBefore.toFixed(2),
      headerBalanceAfter: headerBalance.toFixed(2),
      totalSweptUp: totalSweptUp.toFixed(2),
      totalSweptDown: totalSweptDown.toFixed(2),
    };
  }

  // ── Notional pooling: interest netting ───────────────────────────────────

  computeNotionalPoolSummary(poolId: string): NotionalPoolSummary {
    const pool = this.getPool(poolId);
    if (pool.poolType !== 'NOTIONAL') {
      throw new BadRequestException('Notional summary only applies to NOTIONAL pools');
    }

    const annualRate = pool.interestRate;
    const dailyRate = annualRate / 365;

    let notionalBalance = new Decimal(0);
    let totalDebitInterest = new Decimal(0);
    let totalCreditInterest = new Decimal(0);

    for (const account of pool.accounts) {
      notionalBalance = notionalBalance.plus(account.currentBalance);
    }

    // Interest earned/charged if accounts stood alone
    const accountBreakdown: NotionalPoolSummary['accountBreakdown'] = pool.accounts.map((account) => {
      const bal = new Decimal(account.currentBalance);
      const interest = bal.times(dailyRate); // daily interest
      if (bal.greaterThan(0)) totalCreditInterest = totalCreditInterest.plus(interest);
      else totalDebitInterest = totalDebitInterest.plus(interest.abs());

      return {
        accountId: account.accountId,
        accountName: account.accountName,
        balance: bal.toFixed(2),
        interestAllocation: interest.toFixed(4),
      };
    });

    // Netted interest on pooled balance
    const poolInterest = notionalBalance.times(dailyRate);
    const netBenefit = totalDebitInterest.minus(
      notionalBalance.lessThan(0) ? notionalBalance.abs().times(dailyRate) : new Decimal(0),
    );

    return {
      poolId,
      notionalBalance: notionalBalance.toFixed(2),
      interestSaved: totalDebitInterest.toFixed(4),
      interestEarned: totalCreditInterest.toFixed(4),
      interestCharged: totalDebitInterest.toFixed(4),
      netInterestBenefit: netBenefit.toFixed(4),
      accountBreakdown,
    };
  }

  allocateInterest(poolId: string, totalInterest: number, period: string): InterestAllocation {
    const pool = this.getPool(poolId);

    const totalBalance = pool.accounts.reduce(
      (s, a) => s.plus(Math.abs(a.currentBalance)), new Decimal(0),
    );

    const allocations = pool.accounts.map((account) => {
      const weight = totalBalance.isZero()
        ? new Decimal(1).dividedBy(pool.accounts.length)
        : new Decimal(Math.abs(account.currentBalance)).dividedBy(totalBalance);
      const allocated = weight.times(totalInterest);
      return {
        accountId: account.accountId,
        accountName: account.accountName,
        averageBalance: account.currentBalance.toFixed(2),
        interestAllocated: allocated.toFixed(4),
      };
    });

    return {
      poolId,
      period,
      totalInterest: totalInterest.toFixed(4),
      allocations,
    };
  }

  // ── Pool snapshot ─────────────────────────────────────────────────────────

  getPoolSnapshot(poolId: string): {
    pool: CashPool;
    totalBalance: string;
    headerBalance: string;
    subAccountCount: number;
    accountsAboveTarget: number;
    accountsBelowTarget: number;
    accountsBelowMinimum: number;
  } {
    const pool = this.getPool(poolId);
    const totalBalance = pool.accounts.reduce((s, a) => s.plus(a.currentBalance), new Decimal(0));
    const header = pool.accounts.find((a) => a.accountId === pool.headerAccountId);

    return {
      pool,
      totalBalance: totalBalance.toFixed(2),
      headerBalance: header ? header.currentBalance.toFixed(2) : '0.00',
      subAccountCount: pool.accounts.filter((a) => !a.isHeader).length,
      accountsAboveTarget: pool.accounts.filter((a) => a.currentBalance > a.targetBalance).length,
      accountsBelowTarget: pool.accounts.filter((a) => a.currentBalance < a.targetBalance).length,
      accountsBelowMinimum: pool.accounts.filter((a) => a.currentBalance < a.minBalance).length,
    };
  }
}
