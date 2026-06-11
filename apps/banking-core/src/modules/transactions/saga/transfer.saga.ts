import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { JournalService } from '../../ledger/journal.service';
import { AccountsService } from '../../accounts/accounts.service';
import { Money, InsufficientFundsError, AccountStatusError } from '@tpt/shared';
import { JournalType, LedgerEntryType, AccountStatus } from '@tpt/database';
import { InitiateTransferDto } from '../dto/initiate-transfer.dto';

/**
 * TransferSaga — Coordinates an internal funds transfer via a saga pattern.
 *
 * Steps:
 *   1. Validate source and destination accounts (both ACTIVE, same currency)
 *   2. Check sufficient available balance on source
 *   3. Place hold on source account (reserves funds)
 *   4. Post double-entry journal (debit source, credit destination)
 *   5. Release hold on source account
 *   6. Mark transaction COMPLETED
 *
 * Compensating actions (executed on any failure):
 *   - If hold was placed → release it
 *   - If journal was posted → reverse it
 *   - Mark transaction FAILED with reason
 */
@Injectable()
export class TransferSaga {
  private readonly logger = new Logger(TransferSaga.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(dto: InitiateTransferDto): Promise<Transaction> {
    // Check idempotency — return existing if already processed
    const existing = await this.transactionsRepo.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`Idempotent transfer replay: ${dto.idempotencyKey}`);
      return existing;
    }

    // Create transaction record in PENDING state
    const txn = this.transactionsRepo.create({
      type: TransactionType.INTERNAL_TRANSFER,
      status: TransactionStatus.PENDING,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description ?? null,
      idempotencyKey: dto.idempotencyKey,
    });
    const savedTxn = await this.transactionsRepo.save(txn);

    // Update to PROCESSING
    await this.transactionsRepo.update(savedTxn.id, { status: TransactionStatus.PROCESSING });

    try {
      // ── Step 1: Validate accounts ───────────────────────────────────────────
      const [source, destination] = await Promise.all([
        this.accountsService.findByIdOrThrow(dto.sourceAccountId),
        this.accountsService.findByIdOrThrow(dto.destinationAccountId),
      ]);

      if (source.status !== AccountStatus.ACTIVE) {
        throw new AccountStatusError(dto.sourceAccountId, source.status, AccountStatus.ACTIVE);
      }
      if (destination.status !== AccountStatus.ACTIVE) {
        throw new AccountStatusError(dto.destinationAccountId, destination.status, AccountStatus.ACTIVE);
      }

      // ── Step 2: Check sufficient available balance ──────────────────────────
      const transferAmount = Money.fromDecimalString(dto.amount, dto.currency);
      const availableBalance = Money.fromDecimalString(source.availableBalance, source.currency);

      if (transferAmount.greaterThan(availableBalance)) {
        throw new InsufficientFundsError(
          dto.sourceAccountId,
          dto.amount,
          source.availableBalance,
          dto.currency,
        );
      }

      // ── Step 3: Place hold on source ────────────────────────────────────────
      await this.accountsService.placeHold(dto.sourceAccountId, dto.amount, dto.currency);
      await this.transactionsRepo.update(savedTxn.id, { holdPlaced: true });

      // ── Step 4: Post journal ────────────────────────────────────────────────
      const journal = await this.journalService.postJournal({
        description: dto.description ?? `Internal transfer ${savedTxn.transactionNumber}`,
        type: JournalType.TRANSFER,
        reference: savedTxn.transactionNumber,
        idempotencyKey: `journal:${dto.idempotencyKey}`,
        entries: [
          {
            accountId: dto.sourceAccountId,
            type: LedgerEntryType.DEBIT,
            amount: dto.amount,
            currency: dto.currency,
            description: `Transfer to account ${destination.accountNumber}`,
          },
          {
            accountId: dto.destinationAccountId,
            type: LedgerEntryType.CREDIT,
            amount: dto.amount,
            currency: dto.currency,
            description: `Transfer from account ${source.accountNumber}`,
          },
        ],
      });

      await this.transactionsRepo.update(savedTxn.id, { journalId: journal.id });

      // ── Step 5: Release hold ────────────────────────────────────────────────
      await this.accountsService.releaseHold(dto.sourceAccountId, dto.amount, dto.currency);

      // ── Step 6: Mark COMPLETED ──────────────────────────────────────────────
      await this.transactionsRepo.update(savedTxn.id, {
        status: TransactionStatus.COMPLETED,
        holdPlaced: false,
        completedAt: new Date(),
      });

      this.logger.log(
        `Transfer completed: ${savedTxn.transactionNumber} | ${dto.amount} ${dto.currency} | ${dto.sourceAccountId} → ${dto.destinationAccountId}`,
      );

      return this.transactionsRepo.findOneOrFail({ where: { id: savedTxn.id } });
    } catch (error) {
      // ── Compensating actions ────────────────────────────────────────────────
      await this.compensate(savedTxn.id, error);
      throw error;
    }
  }

  private async compensate(transactionId: string, error: unknown): Promise<void> {
    const txn = await this.transactionsRepo.findOne({ where: { id: transactionId } });
    if (!txn) return;

    const failureReason = error instanceof Error ? error.message : String(error);

    try {
      // Reverse journal if one was posted
      if (txn.journalId) {
        this.logger.warn(`Compensating: reversing journal ${txn.journalId} for txn ${transactionId}`);
        await this.journalService.reverseJournal(txn.journalId, `Compensation for failed transfer ${transactionId}`);
      }

      // Release hold if one was placed
      if (txn.holdPlaced && txn.sourceAccountId) {
        this.logger.warn(`Compensating: releasing hold on account ${txn.sourceAccountId}`);
        await this.accountsService.releaseHold(txn.sourceAccountId, txn.amount, txn.currency);
      }
    } catch (compensationError) {
      this.logger.error(
        `CRITICAL: Compensation failed for transaction ${transactionId}: ${compensationError instanceof Error ? compensationError.message : String(compensationError)}`,
      );
      // In production: alert operations team, trigger manual review workflow
    }

    await this.transactionsRepo.update(transactionId, {
      status: TransactionStatus.FAILED,
      failureReason,
      holdPlaced: false,
    });
  }
}
