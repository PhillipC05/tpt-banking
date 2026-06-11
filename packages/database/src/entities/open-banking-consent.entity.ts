import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum ConsentStatus {
  AWAITING_AUTHORISATION = 'AWAITING_AUTHORISATION',
  AUTHORISED = 'AUTHORISED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export enum ConsentType {
  ACCOUNT_ACCESS = 'ACCOUNT_ACCESS',  // AISP — read account data
  DOMESTIC_PAYMENT = 'DOMESTIC_PAYMENT',
  INTERNATIONAL_PAYMENT = 'INTERNATIONAL_PAYMENT',
  BULK_PAYMENT = 'BULK_PAYMENT',
  STANDING_ORDER = 'STANDING_ORDER',
}

/**
 * Open Banking consent grant.
 * Represents a PSU (Payment Service User = customer) authorising a TPP to access data or initiate payments.
 * Consent is scoped to specific permissions (per UK OBIE / PSD2).
 */
@Entity('open_banking_consents')
export class OpenBankingConsent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_ob_consent_id', { unique: true })
  @Column({ name: 'consent_id', type: 'varchar', length: 100, unique: true })
  consentId!: string;

  @Index('idx_ob_consent_client')
  @Column({ name: 'client_id', type: 'varchar', length: 100 })
  clientId!: string;

  @Index('idx_ob_consent_customer')
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ type: 'enum', enum: ConsentType })
  type!: ConsentType;

  @Column({ type: 'enum', enum: ConsentStatus, default: ConsentStatus.AWAITING_AUTHORISATION })
  status!: ConsentStatus;

  /**
   * Granted permissions — subset of OBIE permissions:
   * ReadAccountsBasic, ReadAccountsDetail, ReadBalances, ReadTransactionsDetail, etc.
   */
  @Column({ type: 'simple-array' })
  permissions!: string[];

  /** Specific account IDs the TPP is authorised to access (empty = all) */
  @Column({ name: 'authorised_account_ids', type: 'uuid', array: true, default: '{}' })
  authorisedAccountIds!: string[];

  /** When the consent expires */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /** When the TPP can start accessing data (not before) */
  @Column({ name: 'transaction_from_date', type: 'timestamptz', nullable: true })
  transactionFromDate!: Date | null;

  /** When the TPP can access data up to */
  @Column({ name: 'transaction_to_date', type: 'timestamptz', nullable: true })
  transactionToDate!: Date | null;

  /** Payment details — stored for payment initiation consents */
  @Column({ name: 'payment_details', type: 'jsonb', nullable: true })
  paymentDetails!: Record<string, unknown> | null;

  /** PKCE code verifier hash (for PKCE flow) */
  @Column({ name: 'code_challenge', type: 'varchar', length: 200, nullable: true })
  codeChallenge!: string | null;

  @Column({ name: 'code_challenge_method', type: 'varchar', length: 10, nullable: true })
  codeChallengeMethod!: string | null;

  /** State parameter for CSRF protection */
  @Column({ name: 'state', type: 'varchar', length: 200, nullable: true })
  state!: string | null;

  /** Authorization code (short-lived, used once) */
  @Column({ name: 'authorization_code', type: 'varchar', length: 200, nullable: true })
  authorizationCode!: string | null;

  @Column({ name: 'authorization_code_expires_at', type: 'timestamptz', nullable: true })
  authorizationCodeExpiresAt!: Date | null;

  @Column({ name: 'redirect_uri', type: 'varchar', length: 500, nullable: true })
  redirectUri!: string | null;

  @Column({ name: 'authorised_at', type: 'timestamptz', nullable: true })
  authorisedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'risk_data', type: 'jsonb', nullable: true })
  riskData!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateConsentId(): void {
    if (!this.consentId) {
      this.consentId = `consent-${uuidv4()}`;
    }
  }
}
