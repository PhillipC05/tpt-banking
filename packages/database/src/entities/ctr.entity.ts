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

export enum CtrStatus {
  PENDING = 'PENDING',
  FILED = 'FILED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  AMENDED = 'AMENDED',
}

/**
 * Currency Transaction Report (CTR) — required for cash transactions > $10,000.
 * Must be filed with FinCEN within 15 days of the transaction.
 * BSA requirement: 31 CFR § 1010.311.
 */
@Entity('ctrs')
export class Ctr {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_ctrs_number', { unique: true })
  @Column({ name: 'ctr_number', type: 'varchar', length: 25, unique: true })
  ctrNumber!: string;

  @Index('idx_ctrs_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId!: string | null;

  @Column({ type: 'enum', enum: CtrStatus, default: CtrStatus.PENDING })
  status!: CtrStatus;

  /** Cash amount (must be > $10,000 USD) */
  @Column({ name: 'cash_amount', type: 'numeric', precision: 20, scale: 2 })
  cashAmount!: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate!: Date;

  /** DEPOSIT or WITHDRAWAL */
  @Column({ name: 'transaction_type', type: 'varchar', length: 20 })
  transactionType!: string;

  /** Person conducting transaction (may differ from account holder) */
  @Column({ name: 'conductor_info', type: 'jsonb' })
  conductorInfo!: Record<string, unknown>;

  /** Person on whose behalf the transaction is conducted */
  @Column({ name: 'beneficiary_info', type: 'jsonb', nullable: true })
  beneficiaryInfo!: Record<string, unknown> | null;

  /** FinCEN BSA ID after filing */
  @Column({ name: 'fincen_bsa_id', type: 'varchar', length: 50, nullable: true })
  fincenBsaId!: string | null;

  @Column({ name: 'filed_at', type: 'timestamptz', nullable: true })
  filedAt!: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  /** CTR deadline: 15 days from transaction date */
  @Column({ name: 'deadline', type: 'timestamptz' })
  deadline!: Date;

  @Column({ name: 'filed_by_user_id', type: 'uuid', nullable: true })
  filedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateCtrNumber(): void {
    if (!this.ctrNumber) {
      const year = new Date().getFullYear();
      const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
      this.ctrNumber = `CTR-${year}-${rand}`;
    }
  }
}
