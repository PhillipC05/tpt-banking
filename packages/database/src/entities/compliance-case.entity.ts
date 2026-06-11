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

export enum CaseType {
  AML = 'AML',
  FRAUD = 'FRAUD',
  KYC = 'KYC',
  SANCTIONS = 'SANCTIONS',
  GENERAL = 'GENERAL',
}

export enum CaseStatus {
  OPEN = 'OPEN',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  PENDING_ESCALATION = 'PENDING_ESCALATION',
  SAR_FILED = 'SAR_FILED',
  CLOSED_NO_ACTION = 'CLOSED_NO_ACTION',
  CLOSED_ACTION_TAKEN = 'CLOSED_ACTION_TAKEN',
}

export enum CasePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity('compliance_cases')
export class ComplianceCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_cases_number', { unique: true })
  @Column({ name: 'case_number', type: 'varchar', length: 25, unique: true })
  caseNumber!: string;

  @Index('idx_cases_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: CaseType })
  type!: CaseType;

  @Column({ type: 'enum', enum: CaseStatus, default: CaseStatus.OPEN })
  status!: CaseStatus;

  @Column({ type: 'enum', enum: CasePriority, default: CasePriority.MEDIUM })
  priority!: CasePriority;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId!: string | null;

  /** Alert IDs linked to this case */
  @Column({ name: 'alert_ids', type: 'uuid', array: true, default: '{}' })
  alertIds!: string[];

  /** Linked SAR ID if a SAR was filed */
  @Column({ name: 'sar_id', type: 'uuid', nullable: true })
  sarId!: string | null;

  /** Case notes / timeline as an append-only JSONB array */
  @Column({ type: 'jsonb', default: '[]' })
  notes!: Array<{
    userId: string;
    note: string;
    timestamp: string;
  }>;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId!: string | null;

  @Column({ name: 'closure_reason', type: 'text', nullable: true })
  closureReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateCaseNumber(): void {
    if (!this.caseNumber) {
      const ts = Date.now().toString().slice(-8);
      const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.caseNumber = `CASE-${ts}${rand}`;
    }
  }
}
