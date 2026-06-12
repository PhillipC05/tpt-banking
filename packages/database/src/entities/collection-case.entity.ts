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

export enum CollectionCaseStatus {
  OPEN = 'OPEN',
  IN_WORKOUT = 'IN_WORKOUT',
  RESOLVED = 'RESOLVED',
  CHARGED_OFF = 'CHARGED_OFF',
  LEGAL = 'LEGAL',
}

@Entity('collection_cases')
export class CollectionCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_collection_cases_loan_id')
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId!: string;

  @Index('idx_collection_cases_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: CollectionCaseStatus, default: CollectionCaseStatus.OPEN })
  status!: CollectionCaseStatus;

  @Column({ name: 'days_overdue', type: 'int', default: 0 })
  daysOverdue!: number;

  @Column({ name: 'amount_overdue', type: 'numeric', precision: 20, scale: 6, default: '0' })
  amountOverdue!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ name: 'missed_payments', type: 'int', default: 0 })
  missedPayments!: number;

  @Column({ name: 'collector_id', type: 'uuid', nullable: true })
  collectorId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'charged_off_at', type: 'timestamptz', nullable: true })
  chargedOffAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) this.id = uuidv4();
  }
}
