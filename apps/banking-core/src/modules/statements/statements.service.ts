import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, LedgerEntry } from '@tpt/database';
import { Money } from '@tpt/shared';

export interface StatementPeriod {
  year: number;
  month: number; // 1-12
}

export interface StatementLine {
  date: string;
  description: string;
  type: 'DEBIT' | 'CREDIT';
  amount: string;
  balance: string;
  reference?: string;
}

export interface AccountStatement {
  accountId: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  period: { from: string; to: string };
  openingBalance: string;
  closingBalance: string;
  totalCredits: string;
  totalDebits: string;
  lines: StatementLine[];
  generatedAt: string;
}

@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
  ) {}

  async generateMonthlyStatement(
    accountId: string,
    period: StatementPeriod,
  ): Promise<AccountStatement> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    const from = new Date(period.year, period.month - 1, 1);
    const to = new Date(period.year, period.month, 0, 23, 59, 59, 999);

    // Get all ledger entries for the period
    const entries = await this.ledgerRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.journal', 'journal')
      .where('entry.accountId = :accountId', { accountId })
      .andWhere('entry.createdAt BETWEEN :from AND :to', { from, to })
      .orderBy('entry.createdAt', 'ASC')
      .getMany();

    // Get opening balance (balance just before the period)
    const openingEntry = await this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.accountId = :accountId', { accountId })
      .andWhere('entry.createdAt < :from', { from })
      .orderBy('entry.createdAt', 'DESC')
      .limit(1)
      .getOne();

    const openingBalance = openingEntry
      ? Money.fromDecimalString(openingEntry.balanceAfter, account.currency)
      : Money.zero(account.currency);

    let totalCredits = Money.zero(account.currency);
    let totalDebits = Money.zero(account.currency);

    const lines: StatementLine[] = entries.map((entry) => {
      const amount = Money.fromDecimalString(entry.amount, entry.currency);
      if (entry.type === 'CREDIT') {
        totalCredits = totalCredits.add(amount);
      } else {
        totalDebits = totalDebits.add(amount);
      }

      const journal = entry.journal as { description?: string; reference?: string } | null;

      return {
        date: entry.createdAt.toISOString().split('T')[0],
        description: entry.description ?? journal?.description ?? 'Transaction',
        type: entry.type as 'DEBIT' | 'CREDIT',
        amount: amount.toDecimalString(),
        balance: entry.balanceAfter,
        reference: journal?.reference ?? undefined,
      };
    });

    const closingBalance = entries.length > 0
      ? Money.fromDecimalString(entries[entries.length - 1].balanceAfter, account.currency)
      : openingBalance;

    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountType: account.type,
      currency: account.currency,
      period: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      },
      openingBalance: openingBalance.toDecimalString(),
      closingBalance: closingBalance.toDecimalString(),
      totalCredits: totalCredits.toDecimalString(),
      totalDebits: totalDebits.toDecimalString(),
      lines,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Returns available statement periods (last 24 months) */
  availableStatementPeriods(): StatementPeriod[] {
    const periods: StatementPeriod[] = [];
    const now = new Date();
    for (let i = 1; i <= 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return periods;
  }
}
