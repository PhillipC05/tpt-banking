import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum SepaScheme {
  SCT = 'SCT',       // SEPA Credit Transfer (standard, 1-2 days)
  SCT_INST = 'SCT_INST', // SEPA Instant Credit Transfer (10-second SLA)
  SDD_CORE = 'SDD_CORE', // SEPA Direct Debit Core
}

export enum SepaStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  FAILED = 'FAILED',
}

/**
 * SEPA payment entity.
 * Covers SCT (standard), SCT Inst (instant), and SDD Core (direct debit).
 * All amounts in EUR. IBAN mandatory. ISO 20022 XML messages.
 *
 * SCT Inst: max €100,000 per transaction, 10-second SLA, 24/7/365.
 */
@Entity('sepa_payments')
export class SepaPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_sepa_ref', { unique: true })
  @Column({ name: 'payment_reference', type: 'varchar', length: 35, unique: true })
  paymentReference!: string;

  @Index('idx_sepa_account')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: SepaScheme })
  scheme!: SepaScheme;

  @Column({ type: 'enum', enum: SepaStatus, default: SepaStatus.PENDING })
  status!: SepaStatus;

  /** Always EUR for SEPA */
  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency!: string;

  // ─── Debtor (sender) ─────────────────────────────────────────────────────
  @Column({ name: 'debtor_name', type: 'varchar', length: 200 })
  debtorName!: string;

  @Column({ name: 'debtor_iban', type: 'varchar', length: 34 })
  debtorIban!: string;

  @Column({ name: 'debtor_bic', type: 'varchar', length: 11, nullable: true })
  debtorBic!: string | null;

  // ─── Creditor (recipient) ────────────────────────────────────────────────
  @Column({ name: 'creditor_name', type: 'varchar', length: 200 })
  creditorName!: string;

  @Column({ name: 'creditor_iban', type: 'varchar', length: 34 })
  creditorIban!: string;

  @Column({ name: 'creditor_bic', type: 'varchar', length: 11, nullable: true })
  creditorBic!: string | null;

  @Column({ name: 'creditor_bank_name', type: 'varchar', length: 200, nullable: true })
  creditorBankName!: string | null;

  @Column({ name: 'creditor_address', type: 'varchar', length: 500, nullable: true })
  creditorAddress!: string | null;

  @Column({ name: 'creditor_country', type: 'varchar', length: 2, nullable: true })
  creditorCountry!: string | null;

  // ─── ISO 20022 fields ────────────────────────────────────────────────────
  @Column({ name: 'end_to_end_id', type: 'varchar', length: 35 })
  endToEndId!: string;

  /** Unstructured remittance info (max 140 chars) */
  @Column({ name: 'remittance_info', type: 'varchar', length: 140, nullable: true })
  remittanceInfo!: string | null;

  /** Purpose code per ISO 20022 (e.g. SALA, RENT, BEXP) */
  @Column({ name: 'purpose_code', type: 'varchar', length: 4, nullable: true })
  purposeCode!: string | null;

  /** Category purpose (e.g. CASH, CORT, INTC) */
  @Column({ name: 'category_purpose', type: 'varchar', length: 4, nullable: true })
  categoryPurpose!: string | null;

  // ─── Network ─────────────────────────────────────────────────────────────
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

  /** Requested execution date (value date) */
  @Column({ name: 'execution_date', type: 'date', nullable: true })
  executionDate!: Date | null;

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
      this.paymentReference = `SCT${ts}${rand}`;
    }
    if (!this.endToEndId) {
      this.endToEndId = `E2E${Date.now().toString().slice(-8)}${uuidv4().replace(/-/g,'').slice(0,8).toUpperCase()}`;
    }
  }
}
