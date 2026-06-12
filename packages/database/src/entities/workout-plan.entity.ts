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

export enum WorkoutPlanType {
  FORBEARANCE = 'FORBEARANCE',
  DEFERMENT = 'DEFERMENT',
  LOAN_MODIFICATION = 'LOAN_MODIFICATION',
  REPAYMENT_PLAN = 'REPAYMENT_PLAN',
  SETTLEMENT = 'SETTLEMENT',
}

export enum WorkoutPlanStatus {
  PROPOSED = 'PROPOSED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DEFAULTED = 'DEFAULTED',
  CANCELLED = 'CANCELLED',
}

@Entity('workout_plans')
export class WorkoutPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_workout_plans_case_id')
  @Column({ name: 'collection_case_id', type: 'uuid' })
  collectionCaseId!: string;

  @Column({ type: 'enum', enum: WorkoutPlanType })
  type!: WorkoutPlanType;

  @Column({ type: 'enum', enum: WorkoutPlanStatus, default: WorkoutPlanStatus.PROPOSED })
  status!: WorkoutPlanStatus;

  /** Reduced monthly payment for forbearance / repayment plans */
  @Column({ name: 'reduced_payment_amount', type: 'numeric', precision: 20, scale: 6, nullable: true })
  reducedPaymentAmount!: string | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: Date | null;

  /** Flexible JSONB bag for plan-type-specific terms (new rate, deferred months, settlement amount, etc.) */
  @Column({ name: 'terms', type: 'jsonb', nullable: true })
  terms!: Record<string, unknown> | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) this.id = uuidv4();
  }
}
