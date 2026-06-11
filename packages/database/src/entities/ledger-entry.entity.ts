import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

/**
 * Whether this ledger entry increases or decreases the account balance.
 * For asset accounts (bank accounts): CREDIT increases balance, DEBIT decreases balance.
 */
export enum LedgerEntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Ledger Entry entity — individual line items within an accounting journal.
 *
 * INVARIANT: Every journal must have at least one DEBIT and one CREDIT entry,
 * and sum(CREDIT.amount) must equal sum(DEBIT.amount) per currency.
 *
 * The database trigger `update_account_balance_on_ledger_entry` fires
 * AFTER INSERT on this table and updates the associated account balance.
 * Application code MUST NEVER update account.balance directly.
 */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_ledger_entries_journal_id')
  @Column({ name: 'journal_id', type: 'uuid' })
  journalId!: string;

  @Index('idx_ledger_entries_account_id')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({
    type: 'enum',
    enum: LedgerEntryType,
  })
  type!: LedgerEntryType;

  /**
   * The amount of this entry. Always stored as a positive value.
   * The sign effect on the account balance is determined by `type`.
   */
  @Column({
    type: 'numeric',
    precision: 20,
    scale: 6,
  })
  amount!: string;

  /**
   * ISO 4217 currency code for this entry.
   */
  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /**
   * Snapshot of the account balance immediately after this entry was applied.
   * Maintained by the DB trigger. Read-only from application code.
   */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 20,
    scale: 6,
    default: '0',
  })
  balanceAfter!: string;

  /**
   * Optional human-readable description for this line item.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne('Journal', 'entries', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal!: unknown;

  @ManyToOne('Account', 'ledgerEntries', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: unknown;
}
