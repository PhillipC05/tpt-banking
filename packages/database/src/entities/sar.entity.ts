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

export enum SarStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  FILED = 'FILED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  REJECTED = 'REJECTED',
}

export enum SarSuspiciousActivityType {
  STRUCTURING = 'STRUCTURING',
  MONEY_LAUNDERING = 'MONEY_LAUNDERING',
  TERRORIST_FINANCING = 'TERRORIST_FINANCING',
  FRAUD = 'FRAUD',
  IDENTITY_THEFT = 'IDENTITY_THEFT',
  BRIBERY = 'BRIBERY',
  CYBER_EVENT = 'CYBER_EVENT',
  MORTGAGE_FRAUD = 'MORTGAGE_FRAUD',
  WIRE_TRANSFER_FRAUD = 'WIRE_TRANSFER_FRAUD',
  OTHER = 'OTHER',
}

/**
 * Suspicious Activity Report (SAR) — filed with FinCEN.
 * Dual-control: requires two compliance officer approvals before filing.
 * 30-day deadline from detection of suspicious activity.
 * 90-day extension available.
 */
@Entity('sars')
export class Sar {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_sars_number', { unique: true })
  @Column({ name: 'sar_number', type: 'varchar', length: 25, unique: true })
  sarNumber!: string;

  @Index('idx_sars_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @Column({ type: 'enum', enum: SarStatus, default: SarStatus.DRAFT })
  status!: SarStatus;

  @Column({ name: 'activity_type', type: 'enum', enum: SarSuspiciousActivityType })
  activityType!: SarSuspiciousActivityType;

  /** Total dollar amount of suspicious activity */
  @Column({ name: 'suspicious_amount', type: 'numeric', precision: 20, scale: 2 })
  suspiciousAmount!: string;

  /** Start date of suspicious activity period */
  @Column({ name: 'activity_from', type: 'date' })
  activityFrom!: Date;

  /** End date of suspicious activity period */
  @Column({ name: 'activity_to', type: 'date' })
  activityTo!: Date;

  /** Narrative (max 8000 chars per FinCEN spec) */
  @Column({ type: 'text' })
  narrative!: string;

  /** Transaction IDs involved */
  @Column({ name: 'related_transaction_ids', type: 'uuid', array: true, default: '{}' })
  relatedTransactionIds!: string[];

  /** Account IDs involved */
  @Column({ name: 'related_account_ids', type: 'uuid', array: true, default: '{}' })
  relatedAccountIds!: string[];

  /** Subject information (JSONB to accommodate FinCEN form fields) */
  @Column({ name: 'subject_info', type: 'jsonb', nullable: true })
  subjectInfo!: Record<string, unknown> | null;

  /** Law enforcement contact if voluntary disclosure */
  @Column({ name: 'law_enforcement_contact', type: 'jsonb', nullable: true })
  lawEnforcementContact!: Record<string, unknown> | null;

  // ─── Dual-control approval ────────────────────────────────────────────────

  @Column({ name: 'prepared_by_user_id', type: 'uuid' })
  preparedByUserId!: string;

  @Column({ name: 'first_approval_user_id', type: 'uuid', nullable: true })
  firstApprovalUserId!: string | null;

  @Column({ name: 'first_approved_at', type: 'timestamptz', nullable: true })
  firstApprovedAt!: Date | null;

  @Column({ name: 'second_approval_user_id', type: 'uuid', nullable: true })
  secondApprovalUserId!: string | null;

  @Column({ name: 'second_approved_at', type: 'timestamptz', nullable: true })
  secondApprovedAt!: Date | null;

  /** FinCEN BSA ID assigned after filing */
  @Column({ name: 'fincen_bsa_id', type: 'varchar', length: 50, nullable: true })
  fincenBsaId!: string | null;

  @Column({ name: 'filed_at', type: 'timestamptz', nullable: true })
  filedAt!: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  /** Deadline: 30 days from activity detection */
  @Column({ name: 'deadline', type: 'timestamptz' })
  deadline!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateSarNumber(): void {
    if (!this.sarNumber) {
      const year = new Date().getFullYear();
      const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
      this.sarNumber = `SAR-${year}-${rand}`;
    }
  }
}
