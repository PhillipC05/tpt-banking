import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum CardType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
  PREPAID = 'PREPAID',
  VIRTUAL = 'VIRTUAL',
}

export enum CardStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  LOST = 'LOST',
  STOLEN = 'STOLEN',
}

export enum CardNetwork {
  VISA = 'VISA',
  MASTERCARD = 'MASTERCARD',
  AMEX = 'AMEX',
}

/**
 * Card entity.
 * SECURITY NOTE: Full PAN is NEVER stored. Only last 4 digits stored.
 * The Stripe card ID (stripe_card_id) is the reference to the actual card.
 */
@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_cards_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Index('idx_cards_account_id')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ type: 'enum', enum: CardType })
  type!: CardType;

  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.PENDING })
  status!: CardStatus;

  @Column({ type: 'enum', enum: CardNetwork, default: CardNetwork.VISA })
  network!: CardNetwork;

  /** Stripe Issuing card ID — the reference to the physical/virtual card */
  @Index('idx_cards_stripe_card_id', { unique: true })
  @Column({ name: 'stripe_card_id', type: 'varchar', length: 100, unique: true, nullable: true })
  stripeCardId!: string | null;

  /** Last 4 digits of PAN — only plaintext card identifier stored */
  @Column({ name: 'last_four', type: 'char', length: 4 })
  lastFour!: string;

  @Column({ name: 'card_holder_name', type: 'varchar', length: 200 })
  cardHolderName!: string;

  @Column({ name: 'expiry_month', type: 'smallint' })
  expiryMonth!: number;

  @Column({ name: 'expiry_year', type: 'smallint' })
  expiryYear!: number;

  /** Daily spend limit */
  @Column({ name: 'spending_limit_daily', type: 'numeric', precision: 20, scale: 6, nullable: true })
  spendingLimitDaily!: string | null;

  /** Monthly spend limit */
  @Column({ name: 'spending_limit_monthly', type: 'numeric', precision: 20, scale: 6, nullable: true })
  spendingLimitMonthly!: string | null;

  /** Current credit limit (for credit cards) */
  @Column({ name: 'credit_limit', type: 'numeric', precision: 20, scale: 6, nullable: true })
  creditLimit!: string | null;

  /** Current available credit */
  @Column({ name: 'available_credit', type: 'numeric', precision: 20, scale: 6, nullable: true })
  availableCredit!: string | null;

  /** Current statement balance (credit cards) */
  @Column({ name: 'statement_balance', type: 'numeric', precision: 20, scale: 6, default: '0' })
  statementBalance!: string;

  @Column({ name: 'minimum_payment_due', type: 'numeric', precision: 20, scale: 6, default: '0' })
  minimumPaymentDue!: string;

  @Column({ name: 'payment_due_date', type: 'date', nullable: true })
  paymentDueDate!: Date | null;

  /** Annual percentage rate for credit cards */
  @Column({ name: 'apr', type: 'numeric', precision: 8, scale: 6, nullable: true })
  apr!: string | null;

  /** PIN is NEVER stored. Set via Stripe API only. */
  @Column({ name: 'pin_set', type: 'boolean', default: false })
  pinSet!: boolean;

  @Column({ name: 'virtual_only', type: 'boolean', default: false })
  virtualOnly!: boolean;

  @Column({ name: 'international_enabled', type: 'boolean', default: false })
  internationalEnabled!: boolean;

  @Column({ name: 'contactless_enabled', type: 'boolean', default: true })
  contactlessEnabled!: boolean;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) this.id = uuidv4();
  }
}
