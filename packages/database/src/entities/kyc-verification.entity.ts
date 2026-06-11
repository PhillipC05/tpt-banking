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

export enum KycProvider {
  JUMIO = 'JUMIO',
  ONFIDO = 'ONFIDO',
  MANUAL = 'MANUAL',
}

export enum KycVerificationStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
}

export enum KycDocumentType {
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  NATIONAL_ID = 'NATIONAL_ID',
  RESIDENCE_PERMIT = 'RESIDENCE_PERMIT',
}

/**
 * KYC verification record.
 * Tracks each identity verification attempt via a third-party provider.
 * Documents and biometric data are stored by the provider — we only store metadata and decisions.
 */
@Entity('kyc_verifications')
export class KycVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_kyc_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'enum', enum: KycProvider })
  provider!: KycProvider;

  @Column({ type: 'enum', enum: KycVerificationStatus, default: KycVerificationStatus.INITIATED })
  status!: KycVerificationStatus;

  /** Provider-assigned verification/check ID */
  @Column({ name: 'provider_reference', type: 'varchar', length: 200, nullable: true })
  providerReference!: string | null;

  /** URL to redirect the customer to for identity verification */
  @Column({ name: 'redirect_url', type: 'text', nullable: true })
  redirectUrl!: string | null;

  @Column({ name: 'document_type', type: 'enum', enum: KycDocumentType, nullable: true })
  documentType!: KycDocumentType | null;

  @Column({ name: 'document_country', type: 'varchar', length: 3, nullable: true })
  documentCountry!: string | null;

  @Column({ name: 'document_number_hash', type: 'varchar', length: 200, nullable: true })
  documentNumberHash!: string | null;

  /** Raw decision from the provider (PASS / FAIL / CAUTION / etc.) */
  @Column({ name: 'provider_decision', type: 'varchar', length: 50, nullable: true })
  providerDecision!: string | null;

  /** Structured rejection reasons from provider */
  @Column({ name: 'rejection_reasons', type: 'jsonb', nullable: true })
  rejectionReasons!: Record<string, unknown>[] | null;

  /** Full provider response payload (for audit) */
  @Column({ name: 'provider_response', type: 'jsonb', nullable: true })
  providerResponse!: Record<string, unknown> | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'reviewer_notes', type: 'text', nullable: true })
  reviewerNotes!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) this.id = uuidv4();
  }
}
