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

export enum AchDirection {
  CREDIT = 'CREDIT',  // Funds coming into the bank
  DEBIT = 'DEBIT',    // Funds going out of the bank
}

export enum AchStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  PENDING_AUTOMATIC_VERIFICATION = 'PENDING_AUTOMATIC_VERIFICATION',
  PENDING_MANUAL_VERIFICATION = 'PENDING_MANUAL_VERIFICATION',
  MICRO_DEPOSIT_VERIFICATION = 'MICRO_DEPOSIT_VERIFICATION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export enum AchReturnCode {
  R01 = 'R01', // Insufficient Funds
  R02 = 'R02', // Account Closed
  R03 = 'R03', // No Account/Unable to Locate Account
  R04 = 'R04', // Invalid Account Number Structure
  R07 = 'R07', // Authorization Revoked by Customer
  R10 = 'R10', // Customer Advises Not Authorized
  R20 = 'R20', // Non-Transaction Account
}

@Entity('ach_payments')
export class AchPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_ach_payments_ref', { unique: true })
  @Column({ name: 'payment_reference', type: 'varchar', length: 30, unique: true })
  paymentReference!: string;

  @Index('idx_ach_payments_account_id')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: AchDirection })
  direction!: AchDirection;

  @Column({ type: 'enum', enum: AchStatus, default: AchStatus.PENDING })
  status!: AchStatus;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  /** Description / memo for the ACH transfer */
  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  /** Plaid payment_id from the Plaid API */
  @Column({ name: 'plaid_payment_id', type: 'varchar', length: 100, nullable: true })
  plaidPaymentId!: string | null;

  /** Plaid access_token (encrypted reference, not stored directly) */
  @Column({ name: 'plaid_access_token_ref', type: 'varchar', length: 200, nullable: true })
  plaidAccessTokenRef!: string | null;

  /** Counterparty bank routing number */
  @Column({ name: 'routing_number', type: 'varchar', length: 9, nullable: true })
  routingNumber!: string | null;

  /** Masked counterparty account number (last 4 only) */
  @Column({ name: 'external_account_last4', type: 'varchar', length: 4, nullable: true })
  externalAccountLast4!: string | null;

  @Column({ name: 'external_account_holder_name', type: 'varchar', length: 200, nullable: true })
  externalAccountHolderName!: string | null;

  /** ACH return code if payment was returned */
  @Column({ name: 'return_code', type: 'varchar', length: 10, nullable: true })
  returnCode!: string | null;

  @Column({ name: 'return_reason', type: 'varchar', length: 200, nullable: true })
  returnReason!: string | null;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'estimated_completion', type: 'timestamptz', nullable: true })
  estimatedCompletion!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateReference(): void {
    if (!this.paymentReference) {
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.paymentReference = `ACH-${timestamp}${random}`;
    }
  }
}
