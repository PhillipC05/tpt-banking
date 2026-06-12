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

export enum CddRiskRating {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH',
}

export enum CddSourceOfFunds {
  EMPLOYMENT = 'EMPLOYMENT',
  BUSINESS_INCOME = 'BUSINESS_INCOME',
  INVESTMENTS = 'INVESTMENTS',
  INHERITANCE = 'INHERITANCE',
  PENSION = 'PENSION',
  GIFT = 'GIFT',
  GOVERNMENT_BENEFITS = 'GOVERNMENT_BENEFITS',
  OTHER = 'OTHER',
}

export enum CddStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REQUIRES_EDD = 'REQUIRES_EDD',
  EXPIRED = 'EXPIRED',
}

@Entity('cdd_assessments')
export class CddAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_cdd_assessments_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: CddStatus, default: CddStatus.PENDING })
  status!: CddStatus;

  @Column({ name: 'risk_rating', type: 'enum', enum: CddRiskRating, nullable: true })
  riskRating!: CddRiskRating | null;

  /** Composite 0–100 risk score derived from rule weights */
  @Column({ name: 'risk_score', type: 'int', nullable: true })
  riskScore!: number | null;

  @Column({ name: 'source_of_funds', type: 'enum', enum: CddSourceOfFunds, nullable: true })
  sourceOfFunds!: CddSourceOfFunds | null;

  @Column({ name: 'source_of_wealth', type: 'text', nullable: true })
  sourceOfWealth!: string | null;

  /** For business customers: nature / industry of their business */
  @Column({ name: 'business_nature', type: 'varchar', length: 500, nullable: true })
  businessNature!: string | null;

  /** 25%+ beneficial owners (UBO array) */
  @Column({ name: 'beneficial_owners', type: 'jsonb', nullable: true })
  beneficialOwners!: Record<string, unknown>[] | null;

  @Column({ name: 'politically_exposed', type: 'boolean', default: false })
  politicallyExposed!: boolean;

  @Column({ name: 'adverse_media_hits', type: 'jsonb', nullable: true })
  adverseMediaHits!: Record<string, unknown>[] | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /** Risk-based review cycle: LOW=3yr, MEDIUM=2yr, HIGH/VERY_HIGH=1yr */
  @Column({ name: 'next_review_date', type: 'date', nullable: true })
  nextReviewDate!: Date | null;

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
