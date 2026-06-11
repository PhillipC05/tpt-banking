import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum LoanPaymentStatus {
  SCHEDULED = 'SCHEDULED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
  WAIVED = 'WAIVED',
}

export enum LoanPaymentType {
  REGULAR = 'REGULAR',
  EXTRA_PRINCIPAL = 'EXTRA_PRINCIPAL',
  LATE_FEE = 'LATE_FEE',
  PAYOFF = 'PAYOFF',
}

@Entity('loan_payments')
export class LoanPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_loan_payments_loan_id')
  @Column({ name: 'loan_id', type: 'uuid' })
  loanId!: string;

  @Column({ name: 'payment_number', type: 'varchar', length: 25, unique: true })
  paymentNumber!: string;

  @Column({ type: 'enum', enum: LoanPaymentType, default: LoanPaymentType.REGULAR })
  type!: LoanPaymentType;

  @Column({ type: 'enum', enum: LoanPaymentStatus, default: LoanPaymentStatus.SCHEDULED })
  status!: LoanPaymentStatus;

  /** Total payment amount */
  @Column({ name: 'payment_amount', type: 'numeric', precision: 20, scale: 6 })
  paymentAmount!: string;

  /** Portion applied to principal */
  @Column({ name: 'principal_portion', type: 'numeric', precision: 20, scale: 6, default: '0' })
  principalPortion!: string;

  /** Portion applied to interest */
  @Column({ name: 'interest_portion', type: 'numeric', precision: 20, scale: 6, default: '0' })
  interestPortion!: string;

  /** Fees included in this payment */
  @Column({ name: 'fee_portion', type: 'numeric', precision: 20, scale: 6, default: '0' })
  feePortion!: string;

  /** Remaining principal balance after this payment */
  @Column({ name: 'balance_after', type: 'numeric', precision: 20, scale: 6, nullable: true })
  balanceAfter!: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  @Column({ name: 'sequence_number', type: 'int' })
  sequenceNumber!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  generatePaymentNumber(): void {
    if (!this.paymentNumber) {
      const hex = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      this.paymentNumber = `PMT-${hex}`;
    }
  }
}
