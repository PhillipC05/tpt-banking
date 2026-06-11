import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum TransactionType {
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ACH = 'ACH',
  WIRE = 'WIRE',
  SWIFT = 'SWIFT',
  RTP = 'RTP',
  FED_NOW = 'FED_NOW',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
  CANCELLED = 'CANCELLED',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_transactions_number', { unique: true })
  @Column({ name: 'transaction_number', type: 'varchar', length: 30, unique: true })
  transactionNumber!: string;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status!: TransactionStatus;

  @Index('idx_transactions_source_account')
  @Column({ name: 'source_account_id', type: 'uuid', nullable: true })
  sourceAccountId!: string | null;

  @Index('idx_transactions_destination_account')
  @Column({ name: 'destination_account_id', type: 'uuid', nullable: true })
  destinationAccountId!: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 20, scale: 6, default: '0' })
  fee!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Index('idx_transactions_journal_id')
  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  @Index('idx_transactions_idempotency_key', { unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, unique: true })
  idempotencyKey!: string;

  @Column({ name: 'failure_reason', type: 'varchar', length: 500, nullable: true })
  failureReason!: string | null;

  @Column({ name: 'hold_placed', type: 'boolean', default: false })
  holdPlaced!: boolean;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  generateTransactionNumber(): void {
    if (!this.transactionNumber) {
      const timestamp = Date.now().toString().slice(-10);
      const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
      this.transactionNumber = `TXN-${timestamp}${random}`;
    }
  }
}
