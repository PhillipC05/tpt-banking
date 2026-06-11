import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum RtpRail {
  TCH_RTP = 'TCH_RTP',     // The Clearing House Real-Time Payments
  FED_NOW = 'FED_NOW',      // Federal Reserve FedNow
}

export enum RtpStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
}

export enum RtpDirection {
  CREDIT_PUSH = 'CREDIT_PUSH',           // Standard RTP / FedNow send
  REQUEST_FOR_PAYMENT = 'REQUEST_FOR_PAYMENT', // RfP — request another party to pay
}

/**
 * Real-Time Payment entity (covers both TCH RTP and FedNow).
 * Both rails use ISO 20022 messages, sub-second settlement, 24/7/365.
 *
 * TCH RTP limits: $1,000,000 per transaction
 * FedNow limits:  $500,000 per transaction (default; can be raised to $1M)
 */
@Entity('rtp_payments')
export class RtpPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_rtp_ref', { unique: true })
  @Column({ name: 'payment_reference', type: 'varchar', length: 35, unique: true })
  paymentReference!: string;

  @Index('idx_rtp_account')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: RtpRail })
  rail!: RtpRail;

  @Column({ type: 'enum', enum: RtpDirection, default: RtpDirection.CREDIT_PUSH })
  direction!: RtpDirection;

  @Column({ type: 'enum', enum: RtpStatus, default: RtpStatus.PENDING })
  status!: RtpStatus;

  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount!: string;

  /** Always USD for RTP/FedNow */
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  // ─── Creditor (recipient) ────────────────────────────────────────────────
  @Column({ name: 'creditor_name', type: 'varchar', length: 200 })
  creditorName!: string;

  @Column({ name: 'creditor_account_number', type: 'varchar', length: 34 })
  creditorAccountNumber!: string;

  @Column({ name: 'creditor_routing_number', type: 'varchar', length: 9 })
  creditorRoutingNumber!: string;

  @Column({ name: 'creditor_bank_name', type: 'varchar', length: 200, nullable: true })
  creditorBankName!: string | null;

  // ─── ISO 20022 fields ────────────────────────────────────────────────────
  /** End-to-end ID (max 35 chars) — passed through unmodified */
  @Column({ name: 'end_to_end_id', type: 'varchar', length: 35 })
  endToEndId!: string;

  /** Unstructured remittance information (max 140 chars per ISO 20022) */
  @Column({ name: 'remittance_info', type: 'varchar', length: 140, nullable: true })
  remittanceInfo!: string | null;

  /** Purpose code (e.g. SALA = Salary, BEXP = Business Expense) */
  @Column({ name: 'purpose_code', type: 'varchar', length: 4, nullable: true })
  purposeCode!: string | null;

  // ─── Network response ────────────────────────────────────────────────────
  /** Network-assigned transaction ID */
  @Column({ name: 'network_transaction_id', type: 'varchar', length: 100, nullable: true })
  networkTransactionId!: string | null;

  @Column({ name: 'rejection_reason_code', type: 'varchar', length: 10, nullable: true })
  rejectionReasonCode!: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateRef(): void {
    if (!this.paymentReference) {
      const ts = Date.now().toString().slice(-10);
      const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.paymentReference = `RTP${ts}${rand}`;
    }
    if (!this.endToEndId) {
      this.endToEndId = `E2E${Date.now().toString().slice(-10)}${uuidv4().replace(/-/g,'').slice(0,6).toUpperCase()}`;
    }
  }
}
