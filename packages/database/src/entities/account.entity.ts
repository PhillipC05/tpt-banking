import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Types of bank accounts offered by the platform.
 */
export enum AccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  MONEY_MARKET = 'MONEY_MARKET',
  CERTIFICATE_OF_DEPOSIT = 'CERTIFICATE_OF_DEPOSIT',
  LOAN = 'LOAN',
  INVESTMENT = 'INVESTMENT',
}

/**
 * Account lifecycle status.
 */
export enum AccountStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DORMANT = 'DORMANT',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

/**
 * Bank Account entity.
 *
 * CRITICAL INVARIANT: The `balance` and `availableBalance` columns
 * are NEVER updated by direct UPDATE statements from application code.
 * They are maintained exclusively by the database trigger
 * `update_account_balance_on_ledger_entry` defined in the initial migration.
 * All balance changes must go through posting a ledger journal.
 */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Customer-facing account number. Auto-generated 20-digit number.
   */
  @Index('idx_accounts_account_number', { unique: true })
  @Column({ name: 'account_number', type: 'varchar', length: 20, unique: true })
  accountNumber!: string;

  @Index('idx_accounts_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({
    type: 'enum',
    enum: AccountType,
  })
  type!: AccountType;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
  })
  status!: AccountStatus;

  /**
   * ISO 4217 currency code, 3 characters.
   */
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  /**
   * Current account balance.
   * READ-ONLY from application code — maintained by DB trigger only.
   * Stores sum(CREDIT) - sum(DEBIT) of all ledger entries for this account.
   */
  @Column({
    type: 'numeric',
    precision: 20,
    scale: 6,
    default: '0',
  })
  balance!: string;

  /**
   * Available balance = balance - holdAmount.
   * Used to check whether a transaction can proceed.
   * READ-ONLY from application code — maintained by DB trigger only.
   */
  @Column({
    name: 'available_balance',
    type: 'numeric',
    precision: 20,
    scale: 6,
    default: '0',
  })
  availableBalance!: string;

  /**
   * Total amount currently on hold (e.g. pending authorisations).
   * Reduces available balance without affecting booked balance.
   */
  @Column({
    name: 'hold_amount',
    type: 'numeric',
    precision: 20,
    scale: 6,
    default: '0',
  })
  holdAmount!: string;

  /**
   * Maximum amount the account can go into deficit (0 = no overdraft).
   */
  @Column({
    name: 'overdraft_limit',
    type: 'numeric',
    precision: 20,
    scale: 6,
    default: '0',
  })
  overdraftLimit!: string;

  /**
   * Annual interest rate as a decimal (e.g. 0.045 = 4.5%).
   */
  @Column({
    name: 'interest_rate',
    type: 'numeric',
    precision: 8,
    scale: 6,
    nullable: true,
  })
  interestRate!: string | null;

  @Column({ name: 'opened_at', type: 'timestamptz', default: () => 'NOW()' })
  openedAt!: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne('Customer', 'accounts', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer!: unknown;

  @OneToMany('LedgerEntry', 'account')
  ledgerEntries!: unknown[];

  // ─── Hooks ───────────────────────────────────────────────────────────────────

  @BeforeInsert()
  generateAccountNumber(): void {
    if (!this.accountNumber) {
      // Generate a 20-digit numeric account number
      const timestamp = Date.now().toString().slice(-10);
      const random = Math.floor(Math.random() * 10000000000)
        .toString()
        .padStart(10, '0');
      this.accountNumber = `${timestamp}${random}`;
    }
  }
}
