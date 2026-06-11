import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ScreeningType {
  SANCTIONS = 'SANCTIONS',    // OFAC, EU, UN, HMT
  PEP = 'PEP',                // Politically Exposed Person
  ADVERSE_MEDIA = 'ADVERSE_MEDIA',
  WATCHLIST = 'WATCHLIST',
}

export enum ScreeningStatus {
  PENDING = 'PENDING',
  CLEAR = 'CLEAR',
  HIT = 'HIT',                // Potential match — requires review
  CONFIRMED_MATCH = 'CONFIRMED_MATCH',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

export enum ScreeningTrigger {
  ONBOARDING = 'ONBOARDING',
  PERIODIC_REFRESH = 'PERIODIC_REFRESH',
  TRANSACTION = 'TRANSACTION',
  MANUAL = 'MANUAL',
  NAME_CHANGE = 'NAME_CHANGE',
}

/**
 * Sanctions, PEP, and watchlist screening result.
 * Backed by ComplyAdvantage API. Each screening generates a record here.
 */
@Entity('screening_results')
export class ScreeningResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_screening_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: ScreeningType })
  type!: ScreeningType;

  @Column({ type: 'enum', enum: ScreeningStatus, default: ScreeningStatus.PENDING })
  status!: ScreeningStatus;

  @Column({ type: 'enum', enum: ScreeningTrigger })
  trigger!: ScreeningTrigger;

  /** ComplyAdvantage search ID */
  @Column({ name: 'provider_search_id', type: 'varchar', length: 100, nullable: true })
  providerSearchId!: string | null;

  /** Risk score from ComplyAdvantage (0-100) */
  @Column({ name: 'risk_score', type: 'numeric', precision: 5, scale: 2, nullable: true })
  riskScore!: string | null;

  /** Number of potential matches returned */
  @Column({ name: 'match_count', type: 'int', default: 0 })
  matchCount!: number;

  /** Matched entity details from provider */
  @Column({ name: 'matches', type: 'jsonb', nullable: true })
  matches!: Record<string, unknown>[] | null;

  /** Full search response (for audit trail) */
  @Column({ name: 'provider_response', type: 'jsonb', nullable: true })
  providerResponse!: Record<string, unknown> | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'reviewer_notes', type: 'text', nullable: true })
  reviewerNotes!: string | null;

  /** Next scheduled re-screen date */
  @Column({ name: 'next_screen_at', type: 'timestamptz', nullable: true })
  nextScreenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
