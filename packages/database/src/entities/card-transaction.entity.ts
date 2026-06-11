import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum CardTransactionStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  CLEARED = 'CLEARED',
  DECLINED = 'DECLINED',
  REVERSED = 'REVERSED',
  DISPUTED = 'DISPUTED',
}

export enum CardTransactionType {
  PURCHASE = 'PURCHASE',
  CASH_ADVANCE = 'CASH_ADVANCE',
  REFUND = 'REFUND',
  FEE = 'FEE',
  INTEREST = 'INTEREST',
  PAYMENT = 'PAYMENT',
  REVERSAL = 'REVERSAL',
}

@Entity('card_transactions')
export class CardTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_card_txns_card_id')
  @Column({ name: 'card_id', type: 'uuid' })
  cardId!: string;

  @Index('idx_card_txns_account_id')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  /** Stripe authorization ID */
  @Column({ name: 'stripe_authorization_id', type: 'varchar', length: 100, nullable: true })
  stripeAuthorizationId!: string | null;

  /** Stripe transaction ID */
  @Column({ name: 'stripe_transaction_id', type: 'varchar', length: 100, nullable: true })
  stripeTransactionId!: string | null;

  @Column({ type: 'enum', enum: CardTransactionType })
  type!: CardTransactionType;

  @Column({ type: 'enum', enum: CardTransactionStatus, default: CardTransactionStatus.PENDING })
  status!: CardTransactionStatus;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  /** Merchant name */
  @Column({ name: 'merchant_name', type: 'varchar', length: 200, nullable: true })
  merchantName!: string | null;

  /** Merchant category code (MCC) */
  @Column({ name: 'merchant_category', type: 'varchar', length: 10, nullable: true })
  merchantCategory!: string | null;

  @Column({ name: 'decline_reason', type: 'varchar', length: 200, nullable: true })
  declineReason!: string | null;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  @Column({ name: 'authorized_at', type: 'timestamptz', nullable: true })
  authorizedAt!: Date | null;

  @Column({ name: 'cleared_at', type: 'timestamptz', nullable: true })
  clearedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
