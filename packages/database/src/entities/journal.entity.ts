import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Types of accounting journals.
 */
export enum JournalType {
  TRANSFER = 'TRANSFER',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  FEE = 'FEE',
  INTEREST = 'INTEREST',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
}

/**
 * Journal posting status.
 */
export enum JournalStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
  FAILED = 'FAILED',
}

/**
 * Accounting Journal entity.
 *
 * A journal is a single balanced accounting event consisting of two or more
 * ledger entries where total debits equal total credits (by currency).
 * This is the atomic unit of the double-entry bookkeeping system.
 */
@Entity('journals')
export class Journal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Human-readable journal reference number, format: JNL-XXXXXXXXX.
   */
  @Index('idx_journals_journal_number', { unique: true })
  @Column({ name: 'journal_number', type: 'varchar', length: 20, unique: true })
  journalNumber!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({
    type: 'enum',
    enum: JournalType,
  })
  type!: JournalType;

  @Column({
    type: 'enum',
    enum: JournalStatus,
    default: JournalStatus.PENDING,
  })
  status!: JournalStatus;

  /**
   * Optional external reference (payment ID, wire transfer reference, etc.).
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  /**
   * Idempotency key provided by the caller to prevent duplicate postings.
   * Unique constraint enforced at DB level.
   */
  @Index('idx_journals_idempotency_key', { unique: true })
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
    unique: true,
  })
  idempotencyKey!: string | null;

  /**
   * Timestamp when the journal was successfully posted to the ledger.
   */
  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt!: Date | null;

  /**
   * FK to the original journal if this is a reversal.
   */
  @Column({ name: 'reversal_of', type: 'uuid', nullable: true })
  reversalOf!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @OneToMany('LedgerEntry', 'journal', { cascade: ['insert'] })
  entries!: unknown[];

  @ManyToOne('Journal', { nullable: true })
  @JoinColumn({ name: 'reversal_of' })
  originalJournal!: unknown | null;

  // ─── Hooks ───────────────────────────────────────────────────────────────────

  @BeforeInsert()
  generateJournalNumber(): void {
    if (!this.journalNumber) {
      // Format: JNL-XXXXXXXXX (9 uppercase hex chars)
      const hex = uuidv4().replace(/-/g, '').substring(0, 9).toUpperCase();
      this.journalNumber = `JNL-${hex}`;
    }
  }
}
