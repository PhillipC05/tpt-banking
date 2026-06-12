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

export enum EddStatus {
  INITIATED = 'INITIATED',
  PENDING_CUSTOMER = 'PENDING_CUSTOMER',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PENDING_MANAGER_APPROVAL = 'PENDING_MANAGER_APPROVAL',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export interface SeniorManagerApproval {
  managerId: string;
  approvedAt: string;
  notes?: string;
}

@Entity('edd_questionnaires')
export class EddQuestionnaire {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_edd_questionnaires_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  /** The CDD assessment that triggered this EDD */
  @Index('idx_edd_questionnaires_cdd_id')
  @Column({ name: 'cdd_assessment_id', type: 'uuid', nullable: true })
  cddAssessmentId!: string | null;

  @Column({ type: 'enum', enum: EddStatus, default: EddStatus.INITIATED })
  status!: EddStatus;

  /** Customer-submitted answers to the enhanced questionnaire */
  @Column({ name: 'questionnaire_data', type: 'jsonb', nullable: true })
  questionnaireData!: Record<string, unknown> | null;

  /** PEP details if customer is a politically exposed person */
  @Column({ name: 'pep_details', type: 'jsonb', nullable: true })
  pepDetails!: Record<string, unknown> | null;

  /** Adverse media findings from re-screening */
  @Column({ name: 'adverse_media_details', type: 'jsonb', nullable: true })
  adverseMediaDetails!: Record<string, unknown> | null;

  /** Required for HNW/VIP — senior manager sign-off */
  @Column({ name: 'senior_manager_approval', type: 'jsonb', nullable: true })
  seniorManagerApproval!: SeniorManagerApproval | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  /** Annual re-verification schedule for HNW/VIP */
  @Column({ name: 'next_review_date', type: 'date', nullable: true })
  nextReviewDate!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

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
