import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Customer lifecycle status.
 */
export enum CustomerStatus {
  PROSPECT = 'PROSPECT',
  PENDING_KYC = 'PENDING_KYC',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

/**
 * Customer tier — determines product access, service levels, and fee schedules.
 */
export enum CustomerTier {
  RETAIL = 'RETAIL',
  PREFERRED = 'PREFERRED',
  HNW = 'HNW',       // High Net Worth
  UHNW = 'UHNW',     // Ultra High Net Worth
  VIP = 'VIP',
}

/**
 * KYC (Know Your Customer) compliance status.
 */
export enum KycStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Customer entity.
 * Represents a banking customer (individual or entity) in the system.
 *
 * SECURITY NOTE: SSN is stored AES-256 encrypted in `ssnEncrypted`.
 * Only the last 4 digits are stored in plaintext for identification.
 * The encryption key is managed by HashiCorp Vault.
 */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Unique Customer Information File number, format: CIF-XXXXXXXX.
   * Auto-generated on insert.
   */
  @Index('idx_customers_customer_number', { unique: true })
  @Column({ name: 'customer_number', type: 'varchar', length: 20, unique: true })
  customerNumber!: string;

  @Index('idx_customers_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ name: 'middle_name', type: 'varchar', length: 100, nullable: true })
  middleName!: string | null;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth!: Date;

  /**
   * AES-256-GCM encrypted Social Security Number.
   * Null for non-US customers or when not collected.
   */
  @Column({ name: 'ssn_encrypted', type: 'bytea', nullable: true })
  ssnEncrypted!: Buffer | null;

  /**
   * Last 4 digits of SSN stored in plaintext for identification purposes.
   */
  @Column({ name: 'ssn_last4', type: 'char', length: 4, nullable: true })
  ssnLast4!: string | null;

  @Column({ type: 'varchar', length: 3 })
  nationality!: string;

  @Column({ name: 'tax_id', type: 'varchar', length: 50, nullable: true })
  taxId!: string | null;

  @Column({
    type: 'enum',
    enum: CustomerStatus,
    default: CustomerStatus.PROSPECT,
  })
  status!: CustomerStatus;

  @Column({
    type: 'enum',
    enum: CustomerTier,
    default: CustomerTier.RETAIL,
  })
  tier!: CustomerTier;

  @Column({
    name: 'kyc_status',
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.NOT_STARTED,
  })
  kycStatus!: KycStatus;

  @Column({ name: 'kyc_completed_at', type: 'timestamptz', nullable: true })
  kycCompletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────

  // Lazy import to avoid circular dependency with Account entity
  @OneToMany('Account', 'customer')
  accounts!: unknown[];

  // ─── Hooks ───────────────────────────────────────────────────────────────────

  @BeforeInsert()
  generateCustomerNumber(): void {
    if (!this.customerNumber) {
      // Format: CIF-XXXXXXXX (8 hex chars from UUID)
      const hex = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      this.customerNumber = `CIF-${hex}`;
    }
  }

  // ─── Computed Properties ─────────────────────────────────────────────────────

  get fullName(): string {
    const parts = [this.firstName, this.middleName, this.lastName].filter(Boolean);
    return parts.join(' ');
  }
}
