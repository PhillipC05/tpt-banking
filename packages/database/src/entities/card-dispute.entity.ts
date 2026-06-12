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

export enum DisputeReason {
  FRAUDULENT = 'FRAUDULENT',
  UNRECOGNIZED = 'UNRECOGNIZED',
  DUPLICATE = 'DUPLICATE',
  PRODUCT_NOT_RECEIVED = 'PRODUCT_NOT_RECEIVED',
  PRODUCT_UNACCEPTABLE = 'PRODUCT_UNACCEPTABLE',
  CREDIT_NOT_PROCESSED = 'CREDIT_NOT_PROCESSED',
  SUBSCRIPTION_CANCELED = 'SUBSCRIPTION_CANCELED',
  GENERAL = 'GENERAL',
}

export enum DisputeStatus {
  WARNING_NEEDS_RESPONSE = 'WARNING_NEEDS_RESPONSE',
  WARNING_UNDER_REVIEW = 'WARNING_UNDER_REVIEW',
  WARNING_CLOSED = 'WARNING_CLOSED',
  NEEDS_RESPONSE = 'NEEDS_RESPONSE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  CHARGE_REFUNDED = 'CHARGE_REFUNDED',
  WON = 'WON',
  LOST = 'LOST',
}

@Entity('card_disputes')
export class CardDispute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stripe dispute ID — idempotency key for webhook upserts */
  @Index('idx_card_disputes_stripe_dispute_id', { unique: true })
  @Column({ name: 'stripe_dispute_id', type: 'varchar', length: 100, unique: true })
  stripeDisputeId!: string;

  @Index('idx_card_disputes_card_id')
  @Column({ name: 'card_id', type: 'uuid', nullable: true })
  cardId!: string | null;

  @Column({ name: 'stripe_charge_id', type: 'varchar', length: 100, nullable: true })
  stripeChargeId!: string | null;

  @Column({ name: 'amount', type: 'numeric', precision: 20, scale: 6 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'enum', enum: DisputeReason })
  reason!: DisputeReason;

  @Column({ type: 'enum', enum: DisputeStatus })
  status!: DisputeStatus;

  /** Deadline set by the issuing bank to respond with evidence */
  @Column({ name: 'respond_by', type: 'timestamptz', nullable: true })
  respondBy!: Date | null;

  /** Evidence payload submitted (or to be submitted) to Stripe */
  @Column({ name: 'evidence', type: 'jsonb', nullable: true })
  evidence!: Record<string, unknown> | null;

  /** Raw Stripe dispute object snapshot */
  @Column({ name: 'stripe_metadata', type: 'jsonb', nullable: true })
  stripeMetadata!: Record<string, unknown> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) this.id = uuidv4();
  }
}
