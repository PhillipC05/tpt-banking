import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountRole = 'NOSTRO' | 'VOSTRO';
export type ReconciliationStatus = 'MATCHED' | 'UNMATCHED' | 'PARTIALLY_MATCHED' | 'DISPUTED';
export type StatementEntryType = 'CREDIT' | 'DEBIT';

export interface NostroAccount {
  accountId: string;
  role: AccountRole;
  accountName: string;
  currency: string;
  correspondentBankId: string;
  correspondentBankName: string;
  correspondentBIC: string;
  iban?: string;
  accountNumber: string;
  internalLedgerAccount: string;     // mirror GL account in our books
  currentBalance: number;            // our books
  correspondentBalance: number;      // their books (from latest statement)
  lastStatementDate: string | null;
  status: 'ACTIVE' | 'DORMANT' | 'CLOSED';
  openedDate: string;
  overdraftLimit: number;
  minimumBalance: number;
}

export interface StatementEntry {
  entryId: string;
  nostroAccountId: string;
  valueDate: string;
  bookingDate: string;
  entryType: StatementEntryType;
  amount: number;
  currency: string;
  counterpartyReference: string;
  ourReference: string;
  description: string;
  reconciliationStatus: ReconciliationStatus;
  matchedEntryId: string | null;
  swiftMT: string;   // MT940/MT950/MT910/MT900
}

export interface ReconciliationReport {
  nostroAccountId: string;
  reportDate: string;
  ourBookBalance: number;
  correspondentBalance: number;
  difference: number;
  status: 'RECONCILED' | 'DIFFERENCE' | 'PENDING';
  unreconciledEntries: StatementEntry[];
  breakDetails: Array<{
    type: 'TIMING' | 'AMOUNT' | 'MISSING_ENTRY' | 'DUPLICATE';
    description: string;
    amount: number;
    entryId?: string;
  }>;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const nostroStore = new Map<string, NostroAccount>();
const statementStore = new Map<string, StatementEntry[]>();

@Injectable()
export class NostroService {
  private readonly logger = new Logger(NostroService.name);

  // ── Account management ────────────────────────────────────────────────────

  openAccount(params: Omit<NostroAccount, 'accountId' | 'currentBalance' | 'correspondentBalance' | 'lastStatementDate' | 'openedDate'>): NostroAccount {
    const accountId = uuidv4();
    const account: NostroAccount = {
      accountId,
      ...params,
      currentBalance: 0,
      correspondentBalance: 0,
      lastStatementDate: null,
      openedDate: new Date().toISOString().split('T')[0]!,
    };
    nostroStore.set(accountId, account);
    statementStore.set(accountId, []);
    this.logger.log(`Opened ${params.role} account: ${accountId} (${params.correspondentBIC} ${params.currency})`);
    return account;
  }

  getAccount(accountId: string): NostroAccount {
    const account = nostroStore.get(accountId);
    if (!account) throw new NotFoundException(`Nostro/Vostro account ${accountId} not found`);
    return account;
  }

  getAllAccounts(role?: AccountRole): NostroAccount[] {
    const all = [...nostroStore.values()];
    return role ? all.filter((a) => a.role === role) : all;
  }

  updateBalance(accountId: string, amount: number, type: StatementEntryType): NostroAccount {
    const account = this.getAccount(accountId);
    const delta = type === 'CREDIT' ? amount : -amount;
    account.currentBalance = new Decimal(account.currentBalance).plus(delta).toNumber();
    if (account.currentBalance < -account.overdraftLimit) {
      this.logger.warn(`Account ${accountId} breached overdraft limit: balance=${account.currentBalance}, limit=${-account.overdraftLimit}`);
    }
    nostroStore.set(accountId, account);
    return account;
  }

  // ── Statement processing (MT940 / MT950) ─────────────────────────────────

  processStatementEntries(
    nostroAccountId: string,
    entries: Array<{
      valueDate: string;
      bookingDate: string;
      entryType: StatementEntryType;
      amount: number;
      counterpartyReference: string;
      ourReference: string;
      description: string;
      swiftMT?: string;
    }>,
    correspondentClosingBalance: number,
  ): { processed: number; autoMatched: number; unmatched: number } {
    const account = this.getAccount(nostroAccountId);
    const existing = statementStore.get(nostroAccountId) ?? [];

    let autoMatched = 0;
    let unmatched = 0;

    for (const raw of entries) {
      // Idempotency: skip if ourReference already processed
      if (existing.some((e) => e.ourReference === raw.ourReference && raw.ourReference)) continue;

      const entry: StatementEntry = {
        entryId: uuidv4(),
        nostroAccountId,
        ...raw,
        swiftMT: raw.swiftMT ?? 'MT940',
        reconciliationStatus: 'UNMATCHED',
        matchedEntryId: null,
        currency: account.currency,
      };

      // Auto-match: look for an existing UNMATCHED entry with matching reference on opposite side
      const opposite = existing.find(
        (e) =>
          e.reconciliationStatus === 'UNMATCHED' &&
          e.entryType !== entry.entryType &&
          Math.abs(e.amount - entry.amount) < 0.01 &&
          (e.ourReference === entry.counterpartyReference || e.counterpartyReference === entry.ourReference),
      );

      if (opposite) {
        entry.reconciliationStatus = 'MATCHED';
        entry.matchedEntryId = opposite.entryId;
        opposite.reconciliationStatus = 'MATCHED';
        opposite.matchedEntryId = entry.entryId;
        autoMatched++;
      } else {
        unmatched++;
      }

      existing.push(entry);
    }

    // Update correspondent balance from statement
    account.correspondentBalance = correspondentClosingBalance;
    account.lastStatementDate = new Date().toISOString().split('T')[0]!;
    nostroStore.set(nostroAccountId, account);
    statementStore.set(nostroAccountId, existing);

    return { processed: entries.length, autoMatched, unmatched };
  }

  manualMatch(entryId1: string, entryId2: string, nostroAccountId: string): void {
    const entries = statementStore.get(nostroAccountId);
    if (!entries) throw new NotFoundException(`No statement for account ${nostroAccountId}`);
    const e1 = entries.find((e) => e.entryId === entryId1);
    const e2 = entries.find((e) => e.entryId === entryId2);
    if (!e1 || !e2) throw new NotFoundException('One or both entries not found');
    if (e1.entryType === e2.entryType) throw new BadRequestException('Cannot match two entries of the same type');
    e1.reconciliationStatus = 'MATCHED';
    e1.matchedEntryId = entryId2;
    e2.reconciliationStatus = 'MATCHED';
    e2.matchedEntryId = entryId1;
    statementStore.set(nostroAccountId, entries);
  }

  disputeEntry(entryId: string, nostroAccountId: string): StatementEntry {
    const entries = statementStore.get(nostroAccountId);
    if (!entries) throw new NotFoundException(`No statement for account ${nostroAccountId}`);
    const entry = entries.find((e) => e.entryId === entryId);
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`);
    entry.reconciliationStatus = 'DISPUTED';
    statementStore.set(nostroAccountId, entries);
    return entry;
  }

  // ── Reconciliation ────────────────────────────────────────────────────────

  reconcile(nostroAccountId: string): ReconciliationReport {
    const account = this.getAccount(nostroAccountId);
    const entries = statementStore.get(nostroAccountId) ?? [];
    const unreconciled = entries.filter((e) => e.reconciliationStatus === 'UNMATCHED' || e.reconciliationStatus === 'DISPUTED');

    const difference = new Decimal(account.currentBalance)
      .minus(account.correspondentBalance)
      .toNumber();

    const breakDetails: ReconciliationReport['breakDetails'] = [];

    // Classify breaks
    for (const entry of unreconciled) {
      const today = new Date();
      const valueDate = new Date(entry.valueDate);
      const daysDiff = Math.abs((today.getTime() - valueDate.getTime()) / 86_400_000);

      if (daysDiff <= 2) {
        breakDetails.push({
          type: 'TIMING',
          description: `${entry.entryType} of ${entry.amount} ${account.currency} on ${entry.valueDate} — likely timing difference`,
          amount: entry.entryType === 'CREDIT' ? entry.amount : -entry.amount,
          entryId: entry.entryId,
        });
      } else {
        breakDetails.push({
          type: 'MISSING_ENTRY',
          description: `${entry.entryType} of ${entry.amount} ${account.currency} on ${entry.valueDate} — no matching counterparty entry (ref: ${entry.ourReference})`,
          amount: entry.entryType === 'CREDIT' ? entry.amount : -entry.amount,
          entryId: entry.entryId,
        });
      }
    }

    const status: ReconciliationReport['status'] =
      Math.abs(difference) < 0.01 && unreconciled.length === 0 ? 'RECONCILED' :
      unreconciled.length > 0 ? 'DIFFERENCE' :
      'PENDING';

    return {
      nostroAccountId,
      reportDate: new Date().toISOString().split('T')[0]!,
      ourBookBalance: account.currentBalance,
      correspondentBalance: account.correspondentBalance,
      difference,
      status,
      unreconciledEntries: unreconciled,
      breakDetails,
    };
  }

  // ── Balance ladder ────────────────────────────────────────────────────────

  getBalanceLadder(currency?: string): Array<{
    accountId: string;
    accountName: string;
    correspondentBIC: string;
    currency: string;
    ourBalance: string;
    correspondentBalance: string;
    difference: string;
    lastStatementDate: string | null;
    status: string;
    overdraftUtilization: string;
  }> {
    return [...nostroStore.values()]
      .filter((a) => !currency || a.currency === currency)
      .map((a) => {
        const diff = new Decimal(a.currentBalance).minus(a.correspondentBalance);
        const overdraftUsed = a.currentBalance < 0 ? Math.abs(a.currentBalance) : 0;
        const utilizationPct = a.overdraftLimit > 0 ? (overdraftUsed / a.overdraftLimit) * 100 : 0;
        return {
          accountId: a.accountId,
          accountName: a.accountName,
          correspondentBIC: a.correspondentBIC,
          currency: a.currency,
          ourBalance: a.currentBalance.toFixed(2),
          correspondentBalance: a.correspondentBalance.toFixed(2),
          difference: diff.toFixed(2),
          lastStatementDate: a.lastStatementDate,
          status: a.status,
          overdraftUtilization: `${utilizationPct.toFixed(1)}%`,
        };
      });
  }
}
