import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum OpenBankingStandard {
  UK_OBIE = 'UK_OBIE',           // UK Open Banking Implementation Entity
  PSD2_BERLIN = 'PSD2_BERLIN',   // PSD2 NextGenPSD2 / Berlin Group
  FDX = 'FDX',                    // US Financial Data Exchange
  GENERIC_OAUTH2 = 'GENERIC_OAUTH2',
}

export enum TppType {
  AISP = 'AISP',   // Account Information Service Provider
  PISP = 'PISP',   // Payment Initiation Service Provider
  CBPII = 'CBPII', // Card Based Payment Instrument Issuer
  ASPSP = 'ASPSP', // Account Servicing Payment Service Provider (our role)
}

export enum ClientStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

/**
 * Open Banking client registration.
 * Represents a Third Party Provider (TPP) registered to access our Open Banking APIs.
 * Client credentials (secret) stored hashed — never in plaintext.
 */
@Entity('open_banking_clients')
export class OpenBankingClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_ob_client_id', { unique: true })
  @Column({ name: 'client_id', type: 'varchar', length: 100, unique: true })
  clientId!: string;

  /** Argon2-hashed client secret */
  @Column({ name: 'client_secret_hash', type: 'varchar', length: 200, nullable: true })
  clientSecretHash!: string | null;

  @Column({ name: 'client_name', type: 'varchar', length: 200 })
  clientName!: string;

  @Column({ name: 'client_description', type: 'varchar', length: 500, nullable: true })
  clientDescription!: string | null;

  @Column({ type: 'enum', enum: OpenBankingStandard })
  standard!: OpenBankingStandard;

  @Column({ name: 'tpp_types', type: 'simple-array' })
  tppTypes!: TppType[];

  @Column({ type: 'enum', enum: ClientStatus, default: ClientStatus.PENDING })
  status!: ClientStatus;

  /** Allowed redirect URIs (PKCE flow) */
  @Column({ name: 'redirect_uris', type: 'text', array: true })
  redirectUris!: string[];

  /** Allowed OAuth2 grant types */
  @Column({ name: 'grant_types', type: 'simple-array', default: 'authorization_code' })
  grantTypes!: string[];

  /** Allowed response types */
  @Column({ name: 'response_types', type: 'simple-array', default: 'code' })
  responseTypes!: string[];

  /** Allowed scopes (e.g. accounts, payments, openid) */
  @Column({ name: 'allowed_scopes', type: 'simple-array' })
  allowedScopes!: string[];

  /** FCA / NCA registration number */
  @Column({ name: 'regulatory_registration_id', type: 'varchar', length: 100, nullable: true })
  regulatoryRegistrationId!: string | null;

  /** EIDAS / Open Banking Directory certificate reference */
  @Column({ name: 'certificate_reference', type: 'varchar', length: 200, nullable: true })
  certificateReference!: string | null;

  @Column({ name: 'logo_uri', type: 'varchar', length: 500, nullable: true })
  logoUri!: string | null;

  @Column({ name: 'tos_uri', type: 'varchar', length: 500, nullable: true })
  tosUri!: string | null;

  @Column({ name: 'policy_uri', type: 'varchar', length: 500, nullable: true })
  policyUri!: string | null;

  @Column({ name: 'jwks_uri', type: 'varchar', length: 500, nullable: true })
  jwksUri!: string | null;

  /** Token lifetime in seconds (default 3600) */
  @Column({ name: 'access_token_ttl', type: 'int', default: 3600 })
  accessTokenTtl!: number;

  /** Refresh token lifetime in seconds (default 7 days) */
  @Column({ name: 'refresh_token_ttl', type: 'int', default: 604800 })
  refreshTokenTtl!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateClientId(): void {
    if (!this.clientId) {
      this.clientId = `tpt_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    }
  }
}
