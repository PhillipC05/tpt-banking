import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  Index,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum LoanType {
  PERSONAL = 'PERSONAL',
  AUTO = 'AUTO',
  MORTGAGE = 'MORTGAGE',
  HOME_EQUITY = 'HOME_EQUITY',
  STUDENT = 'STUDENT',
  BUSINESS = 'BUSINESS',
  LINE_OF_CREDIT = 'LINE_OF_CREDIT',
}

export enum LoanStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  ACTIVE = 'ACTIVE',
  DELINQUENT = 'DELINQUENT',
  DEFAULT = 'DEFAULT',
  PAID_OFF = 'PAID_OFF',
  CHARGED_OFF = 'CHARGED_OFF',
}

export enum AmortizationType {
  FIXED = 'FIXED',
  VARIABLE = 'VARIABLE',
  INTEREST_ONLY = 'INTEREST_ONLY',
  BALLOON = 'BALLOON',
}

/**
 * Loan entity. Covers origination through payoff.
 * Interest is stored as a decimal rate (e.g. 0.065 = 6.5% APR).
 */
@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_loans_loan_number', { unique: true })
  @Column({ name: 'loan_number', type: 'varchar', length: 25, unique: true })
  loanNumber!: string;

  @Index('idx_loans_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  /** Linked account where loan proceeds are deposited and payments debited */
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @Column({ type: 'enum', enum: LoanType })
  type!: LoanType;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.PENDING })
  status!: LoanStatus;

  @Column({ name: 'amortization_type', type: 'enum', enum: AmortizationType, default: AmortizationType.FIXED })
  amortizationType!: AmortizationType;

  /** Original principal requested */
  @Column({ name: 'principal_amount', type: 'numeric', precision: 20, scale: 6 })
  principalAmount!: string;

  /** Current outstanding principal balance */
  @Column({ name: 'outstanding_balance', type: 'numeric', precision: 20, scale: 6, default: '0' })
  outstandingBalance!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  /** Annual percentage rate as decimal (e.g. 0.065 = 6.5%) */
  @Column({ name: 'interest_rate', type: 'numeric', precision: 8, scale: 6 })
  interestRate!: string;

  /** Term in months */
  @Column({ name: 'term_months', type: 'int' })
  termMonths!: number;

  /** Scheduled monthly payment amount */
  @Column({ name: 'monthly_payment', type: 'numeric', precision: 20, scale: 6, nullable: true })
  monthlyPayment!: string | null;

  /** Total interest to be paid over loan life */
  @Column({ name: 'total_interest', type: 'numeric', precision: 20, scale: 6, nullable: true })
  totalInterest!: string | null;

  @Column({ name: 'origination_fee', type: 'numeric', precision: 20, scale: 6, default: '0' })
  originationFee!: string;

  @Column({ name: 'credit_score', type: 'int', nullable: true })
  creditScore!: number | null;

  @Column({ name: 'debt_to_income_ratio', type: 'numeric', precision: 5, scale: 4, nullable: true })
  debtToIncomeRatio!: string | null;

  @Column({ name: 'collateral_description', type: 'varchar', length: 500, nullable: true })
  collateralDescription!: string | null;

  @Column({ name: 'collateral_value', type: 'numeric', precision: 20, scale: 6, nullable: true })
  collateralValue!: string | null;

  @Column({ name: 'purpose', type: 'varchar', length: 500, nullable: true })
  purpose!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'disbursed_at', type: 'timestamptz', nullable: true })
  disbursedAt!: Date | null;

  @Column({ name: 'first_payment_due', type: 'date', nullable: true })
  firstPaymentDue!: Date | null;

  @Column({ name: 'maturity_date', type: 'date', nullable: true })
  maturityDate!: Date | null;

  @Column({ name: 'days_past_due', type: 'int', default: 0 })
  daysPastDue!: number;

  @Column({ name: 'paid_off_at', type: 'timestamptz', nullable: true })
  paidOffAt!: Date | null;

  @Column({ name: 'decline_reason', type: 'varchar', length: 500, nullable: true })
  declineReason!: string | null;

  /** Underwriter notes / decision rationale */
  @Column({ name: 'underwriter_notes', type: 'text', nullable: true })
  underwriterNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateLoanNumber(): void {
    if (!this.loanNumber) {
      const hex = uuidv4().replace(/-/g, '').substring(0, 10).toUpperCase();
      this.loanNumber = `LN-${hex}`;
    }
  }
}
