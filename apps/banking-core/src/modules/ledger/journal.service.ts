import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Journal,
  JournalStatus,
  JournalType,
  LedgerEntry,
  LedgerEntryType,
} from '@tpt/database';
import { Money, UnbalancedJournalError, JournalNotFoundError, JournalAlreadyReversedError } from '@tpt/shared';
import { PostJournalDto, LedgerEntryInputDto } from './dto/post-journal.dto';

@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);

  constructor(
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
    @InjectRepository(LedgerEntry)
    private readonly entriesRepo: Repository<LedgerEntry>,
    private readonly dataSource: DataSource,
  ) {}

  async postJournal(dto: PostJournalDto): Promise<Journal> {
    // Validate balance before hitting the DB
    this.validateBalance(dto.entries);

    // Check for duplicate idempotency key
    if (dto.idempotencyKey) {
      const existing = await this.journalsRepo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
        relations: ['entries'],
      });
      if (existing) {
        this.logger.debug(`Idempotent journal replay: ${dto.idempotencyKey}`);
        return existing;
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const journal = manager.create(Journal, {
        description: dto.description,
        type: dto.type,
        reference: dto.reference ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
        status: JournalStatus.POSTED,
        postedAt: new Date(),
      });

      const savedJournal = await manager.save(Journal, journal);

      const entries = dto.entries.map((e) =>
        manager.create(LedgerEntry, {
          journalId: savedJournal.id,
          accountId: e.accountId,
          type: e.type,
          amount: e.amount,
          currency: e.currency,
          description: e.description ?? null,
        }),
      );

      await manager.save(LedgerEntry, entries);

      return manager.findOneOrFail(Journal, {
        where: { id: savedJournal.id },
        relations: ['entries'],
      });
    });
  }

  async reverseJournal(journalId: string, reason: string): Promise<Journal> {
    const original = await this.journalsRepo.findOne({
      where: { id: journalId },
      relations: ['entries'],
    });

    if (!original) throw new JournalNotFoundError(journalId);
    if (original.status === JournalStatus.REVERSED) {
      throw new JournalAlreadyReversedError(journalId);
    }

    const entries = original.entries as LedgerEntry[];

    const reversalEntries: LedgerEntryInputDto[] = entries.map((e) => ({
      accountId: e.accountId,
      type: e.type === LedgerEntryType.DEBIT ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
      amount: e.amount,
      currency: e.currency,
      description: `Reversal of: ${e.description ?? original.description}`,
    }));

    return this.dataSource.transaction(async (manager) => {
      // Mark original as reversed
      await manager.update(Journal, journalId, { status: JournalStatus.REVERSED });

      // Create reversal journal
      const reversal = manager.create(Journal, {
        description: `REVERSAL: ${reason}`,
        type: JournalType.REVERSAL,
        reversalOf: journalId,
        reference: original.reference,
        status: JournalStatus.POSTED,
        postedAt: new Date(),
      });

      const savedReversal = await manager.save(Journal, reversal);

      const reversalLedgerEntries = reversalEntries.map((e) =>
        manager.create(LedgerEntry, {
          journalId: savedReversal.id,
          accountId: e.accountId,
          type: e.type,
          amount: e.amount,
          currency: e.currency,
          description: e.description ?? null,
        }),
      );

      await manager.save(LedgerEntry, reversalLedgerEntries);

      return manager.findOneOrFail(Journal, {
        where: { id: savedReversal.id },
        relations: ['entries'],
      });
    });
  }

  async findJournal(journalId: string): Promise<Journal> {
    const journal = await this.journalsRepo.findOne({
      where: { id: journalId },
      relations: ['entries'],
    });
    if (!journal) throw new JournalNotFoundError(journalId);
    return journal;
  }

  async getAccountLedger(
    accountId: string,
    params: { from?: Date; to?: Date; page?: number; limit?: number },
  ): Promise<{ entries: LedgerEntry[]; total: number; page: number; limit: number }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);

    const qb = this.entriesRepo
      .createQueryBuilder('entry')
      .where('entry.accountId = :accountId', { accountId })
      .orderBy('entry.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (params.from) qb.andWhere('entry.createdAt >= :from', { from: params.from });
    if (params.to) qb.andWhere('entry.createdAt <= :to', { to: params.to });

    const [entries, total] = await qb.getManyAndCount();
    return { entries, total, page, limit };
  }

  validateBalance(entries: LedgerEntryInputDto[]): void {
    const totals = new Map<string, { debits: Money; credits: Money }>();

    for (const entry of entries) {
      if (!totals.has(entry.currency)) {
        totals.set(entry.currency, {
          debits: Money.zero(entry.currency),
          credits: Money.zero(entry.currency),
        });
      }
      const curr = totals.get(entry.currency)!;
      const amount = Money.fromDecimalString(entry.amount, entry.currency);

      if (entry.type === LedgerEntryType.DEBIT) {
        curr.debits = curr.debits.add(amount);
      } else {
        curr.credits = curr.credits.add(amount);
      }
    }

    for (const [currency, { debits, credits }] of totals.entries()) {
      if (!debits.equals(credits)) {
        throw new UnbalancedJournalError(
          currency,
          debits.toDecimalString(),
          credits.toDecimalString(),
        );
      }
    }
  }
}
