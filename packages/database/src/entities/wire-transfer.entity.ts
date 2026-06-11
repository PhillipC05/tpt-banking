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

export enum WireType {
  DOMESTIC = 'DOMESTIC',   // Fedwire
  INTERNATIONAL = 'INTERNATIONAL', // SWIFT
}

export enum WireStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RECALLED = 'RECALLED',
  RETURNED = 'RETURNED',
}

@Entity('wire_transfers')
export class WireTransfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_wire_transfers_ref', { unique: true })
  @Column({ name: 'wire_reference', type: 'varchar', length: 30, unique: true })
  wireReference!: string;

  @Index('idx_wire_transfers_account_id')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: WireType })
  type!: WireType;

  @Column({ type: 'enum', enum: WireStatus, default: WireStatus.PENDING_APPROVAL })
  status!: WireStatus;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** USD equivalent (for reporting) */
  @Column({ name: 'usd_equivalent', type: 'numeric', precision: 20, scale: 6, nullable: true })
  usdEquivalent!: string | null;

  // ─── Beneficiary ────────────────────────────────────────────────────────────
  @Column({ name: 'beneficiary_name', type: 'varchar', length: 200 })
  beneficiaryName!: string;

  @Column({ name: 'beneficiary_account_number', type: 'varchar', length: 50 })
  beneficiaryAccountNumber!: string;

  @Column({ name: 'beneficiary_routing_number', type: 'varchar', length: 11, nullable: true })
  beneficiaryRoutingNumber!: string | null;

  /** SWIFT/BIC code for international wires */
  @Column({ name: 'beneficiary_swift_bic', type: 'varchar', length: 11, nullable: true })
  beneficiarySwiftBic!: string | null;

  @Column({ name: 'beneficiary_bank_name', type: 'varchar', length: 200, nullable: true })
  beneficiaryBankName!: string | null;

  @Column({ name: 'beneficiary_bank_address', type: 'varchar', length: 500, nullable: true })
  beneficiaryBankAddress!: string | null;

  @Column({ name: 'beneficiary_address', type: 'varchar', length: 500, nullable: true })
  beneficiaryAddress!: string | null;

  @Column({ name: 'beneficiary_country', type: 'varchar', length: 3, nullable: true })
  beneficiaryCountry!: string | null;

  // ─── IBAN (international) ────────────────────────────────────────────────────
  @Column({ name: 'iban', type: 'varchar', length: 34, nullable: true })
  iban!: string | null;

  // ─── Intermediary bank (SWIFT) ───────────────────────────────────────────────
  @Column({ name: 'intermediary_swift_bic', type: 'varchar', length: 11, nullable: true })
  intermediarySwiftBic!: string | null;

  @Column({ name: 'intermediary_bank_name', type: 'varchar', length: 200, nullable: true })
  intermediaryBankName!: string | null;

  // ─── Payment details ─────────────────────────────────────────────────────────
  @Column({ name: 'payment_purpose', type: 'varchar', length: 500, nullable: true })
  paymentPurpose!: string | null;

  @Column({ name: 'wire_fee', type: 'numeric', precision: 20, scale: 6, default: '25' })
  wireFee!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  /** Step-up token used to approve — stored as reference for audit */
  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'failure_reason', type: 'varchar', length: 500, nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateReference(): void {
    if (!this.wireReference) {
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.wireReference = `WIRE-${timestamp}${random}`;
    }
  }
}
