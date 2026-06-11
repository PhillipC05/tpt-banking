import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import {
  Loan,
  LoanStatus,
  LoanPayment,
  LoanPaymentStatus,
  LoanPaymentType,
  JournalType,
  LedgerEntryType,
} from '@tpt/database';
import { Money } from '@tpt/shared';
import { ApplyForLoanDto } from './dto/apply-for-loan.dto';
import { JournalService } from '../ledger/journal.service';
import { AccountsService } from '../accounts/accounts.service';

export interface AmortizationScheduleEntry {
  sequenceNumber: number;
  dueDate: Date;
  paymentAmount: string;
  principalPortion: string;
  interestPortion: string;
  balanceAfter: string;
}

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectRepository(Loan)
    private readonly loansRepo: Repository<Loan>,
    @InjectRepository(LoanPayment)
    private readonly paymentsRepo: Repository<LoanPayment>,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Loan Application ──────────────────────────────────────────────────────

  async applyForLoan(customerId: string, dto: ApplyForLoanDto): Promise<Loan> {
    const interestRate = await this.determineInterestRate(dto.type, dto.termMonths);
    const dtiRatio = this.calculateDti(dto.annualIncome, dto.monthlyDebtObligations);
    const { monthlyPayment, totalInterest } = this.calculateAmortization(
      dto.principalAmount,
      interestRate,
      dto.termMonths,
    );

    const loan = this.loansRepo.create({
      customerId,
      type: dto.type,
      status: LoanStatus.UNDER_REVIEW,
      principalAmount: dto.principalAmount.toString(),
      outstandingBalance: dto.principalAmount.toString(),
      interestRate: interestRate.toString(),
      termMonths: dto.termMonths,
      monthlyPayment: monthlyPayment.toDecimalString(),
      totalInterest: totalInterest.toDecimalString(),
      purpose: dto.purpose ?? null,
      debtToIncomeRatio: dtiRatio?.toString() ?? null,
      collateralDescription: dto.collateralDescription ?? null,
      collateralValue: dto.collateralValue?.toString() ?? null,
      originationFee: this.calculateOriginationFee(dto.principalAmount).toDecimalString(),
    });

    const saved = await this.loansRepo.save(loan);
    this.logger.log(`Loan application ${saved.loanNumber} submitted for customer ${customerId}`);
    return saved;
  }

  // ─── Underwriting (simplified rules-based) ────────────────────────────────

  async underwriteLoan(loanId: string, creditScore: number, approverNotes?: string): Promise<Loan> {
    const loan = await this.findByIdOrThrow(loanId);
    if (loan.status !== LoanStatus.UNDER_REVIEW) {
      throw new BadRequestException(`Loan ${loanId} is not under review`);
    }

    loan.creditScore = creditScore;
    const decision = this.makeUnderwritingDecision(loan, creditScore);

    if (decision.approved) {
      loan.status = LoanStatus.APPROVED;
      loan.approvedAt = new Date();
      loan.underwriterNotes = approverNotes ?? decision.notes;
    } else {
      loan.status = LoanStatus.DECLINED;
      loan.declineReason = decision.declineReason ?? 'Does not meet underwriting criteria';
      loan.underwriterNotes = approverNotes ?? decision.notes;
    }

    return this.loansRepo.save(loan);
  }

  // ─── Disbursement ──────────────────────────────────────────────────────────

  async disburseLoan(loanId: string, accountId: string): Promise<Loan> {
    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, { where: { id: loanId } });
      if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
      if (loan.status !== LoanStatus.APPROVED) {
        throw new BadRequestException(`Loan must be APPROVED before disbursement`);
      }

      // Post journal: debit loan-receivable account (asset), credit customer account
      const journal = await this.journalService.postJournal({
        description: `Loan disbursement for ${loan.loanNumber}`,
        type: JournalType.DEPOSIT,
        reference: loan.loanNumber,
        entries: [
          {
            accountId,
            type: LedgerEntryType.CREDIT,
            amount: loan.principalAmount,
            currency: loan.currency,
            description: `Loan proceeds — ${loan.loanNumber}`,
          },
        ],
      });

      // Generate amortization schedule
      const schedule = this.generateAmortizationSchedule(loan);
      const firstPaymentDate = new Date();
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);

      const maturityDate = new Date(firstPaymentDate);
      maturityDate.setMonth(maturityDate.getMonth() + loan.termMonths - 1);

      // Create payment schedule records
      const payments = schedule.map((entry) =>
        manager.create(LoanPayment, {
          loanId: loan.id,
          type: LoanPaymentType.REGULAR,
          status: LoanPaymentStatus.SCHEDULED,
          paymentAmount: entry.paymentAmount,
          principalPortion: entry.principalPortion,
          interestPortion: entry.interestPortion,
          dueDate: entry.dueDate,
          sequenceNumber: entry.sequenceNumber,
        }),
      );
      await manager.save(LoanPayment, payments);

      // Update loan
      loan.status = LoanStatus.ACTIVE;
      loan.accountId = accountId;
      loan.disbursedAt = new Date();
      loan.firstPaymentDue = firstPaymentDate;
      loan.maturityDate = maturityDate;

      this.logger.log(`Loan ${loan.loanNumber} disbursed to account ${accountId}`);
      return manager.save(Loan, loan);
    });
  }

  // ─── Loan Payment Processing ───────────────────────────────────────────────

  async processPayment(loanId: string, amount: number): Promise<LoanPayment> {
    const loan = await this.findByIdOrThrow(loanId);
    if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.DELINQUENT) {
      throw new BadRequestException(`Cannot process payment on a ${loan.status} loan`);
    }

    const nextPayment = await this.paymentsRepo.findOne({
      where: { loanId, status: LoanPaymentStatus.SCHEDULED },
      order: { sequenceNumber: 'ASC' },
    });

    if (!nextPayment) throw new BadRequestException('No scheduled payments found');

    const paymentMoney = Money.fromDecimalString(amount.toString(), loan.currency);
    const scheduledMoney = Money.fromDecimalString(nextPayment.paymentAmount, loan.currency);

    if (paymentMoney.lessThan(scheduledMoney)) {
      throw new BadRequestException(
        `Payment of ${amount} is less than scheduled amount ${nextPayment.paymentAmount}`,
      );
    }

    const journal = await this.journalService.postJournal({
      description: `Loan payment for ${loan.loanNumber} — payment #${nextPayment.sequenceNumber}`,
      type: JournalType.WITHDRAWAL,
      reference: loan.loanNumber,
      entries: [
        {
          accountId: loan.accountId!,
          type: LedgerEntryType.DEBIT,
          amount: nextPayment.paymentAmount,
          currency: loan.currency,
          description: `Loan payment principal: ${nextPayment.principalPortion}, interest: ${nextPayment.interestPortion}`,
        },
      ],
    });

    const newBalance = Money.fromDecimalString(loan.outstandingBalance, loan.currency)
      .subtract(Money.fromDecimalString(nextPayment.principalPortion, loan.currency));

    await this.paymentsRepo.update(nextPayment.id, {
      status: LoanPaymentStatus.COMPLETED,
      paidAt: new Date(),
      journalId: journal.id,
      balanceAfter: newBalance.toDecimalString(),
    });

    const isPaidOff = newBalance.isZero() || newBalance.isNegative();
    await this.loansRepo.update(loanId, {
      outstandingBalance: newBalance.isNegative() ? '0' : newBalance.toDecimalString(),
      status: isPaidOff ? LoanStatus.PAID_OFF : LoanStatus.ACTIVE,
      daysPastDue: 0,
      paidOffAt: isPaidOff ? new Date() : undefined,
    });

    return this.paymentsRepo.findOneOrFail({ where: { id: nextPayment.id } });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Loan | null> {
    return this.loansRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<Loan> {
    const loan = await this.findById(id);
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);
    return loan;
  }

  async findByCustomer(customerId: string): Promise<Loan[]> {
    return this.loansRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async getPaymentSchedule(loanId: string): Promise<LoanPayment[]> {
    return this.paymentsRepo.find({
      where: { loanId },
      order: { sequenceNumber: 'ASC' },
    });
  }

  // ─── Financial Calculations ────────────────────────────────────────────────

  calculateAmortization(
    principal: number,
    annualRate: number,
    termMonths: number,
  ): { monthlyPayment: Money; totalInterest: Money } {
    const monthlyRate = new Decimal(annualRate).dividedBy(12);

    let monthlyPayment: Decimal;
    if (monthlyRate.isZero()) {
      monthlyPayment = new Decimal(principal).dividedBy(termMonths);
    } else {
      const factor = monthlyRate.plus(1).pow(termMonths);
      monthlyPayment = new Decimal(principal)
        .times(monthlyRate)
        .times(factor)
        .dividedBy(factor.minus(1));
    }

    const totalPayment = monthlyPayment.times(termMonths);
    const totalInterest = totalPayment.minus(principal);

    return {
      monthlyPayment: new Money(monthlyPayment.toDecimalPlaces(6), 'USD'),
      totalInterest: new Money(totalInterest.toDecimalPlaces(6), 'USD'),
    };
  }

  generateAmortizationSchedule(loan: Loan): AmortizationScheduleEntry[] {
    const schedule: AmortizationScheduleEntry[] = [];
    let balance = new Decimal(loan.principalAmount);
    const monthlyRate = new Decimal(loan.interestRate).dividedBy(12);
    const monthlyPayment = new Decimal(loan.monthlyPayment!);

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 1);
    startDate.setDate(1);

    for (let i = 1; i <= loan.termMonths; i++) {
      const interest = balance.times(monthlyRate).toDecimalPlaces(6);
      let principal = monthlyPayment.minus(interest).toDecimalPlaces(6);

      if (i === loan.termMonths) {
        principal = balance; // Final payment covers remaining balance
      }

      balance = balance.minus(principal).toDecimalPlaces(6);
      if (balance.isNegative()) balance = new Decimal(0);

      const dueDate = new Date(startDate);
      dueDate.setMonth(startDate.getMonth() + i - 1);

      schedule.push({
        sequenceNumber: i,
        dueDate,
        paymentAmount: interest.plus(principal).toFixed(6),
        principalPortion: principal.toFixed(6),
        interestPortion: interest.toFixed(6),
        balanceAfter: balance.toFixed(6),
      });
    }

    return schedule;
  }

  private async determineInterestRate(type: LoanType, termMonths: number): Promise<number> {
    // Risk-based pricing (simplified — in production this would query a rate engine)
    const baseRates: Record<string, number> = {
      PERSONAL: 0.0899,
      AUTO: 0.0649,
      MORTGAGE: 0.0625,
      HOME_EQUITY: 0.0725,
      STUDENT: 0.0499,
      BUSINESS: 0.0849,
      LINE_OF_CREDIT: 0.0999,
    };
    const termAdjustment = termMonths > 120 ? 0.005 : 0;
    return (baseRates[type] ?? 0.0999) + termAdjustment;
  }

  private calculateDti(annualIncome?: number, monthlyDebt?: number): number | null {
    if (!annualIncome || !monthlyDebt) return null;
    const monthlyIncome = annualIncome / 12;
    return parseFloat((monthlyDebt / monthlyIncome).toFixed(4));
  }

  private calculateOriginationFee(principal: number): Money {
    // 1% origination fee, capped at $2,500
    const fee = Math.min(principal * 0.01, 2500);
    return new Money(fee.toFixed(6), 'USD');
  }

  private makeUnderwritingDecision(
    loan: Loan,
    creditScore: number,
  ): { approved: boolean; declineReason?: string; notes: string } {
    const dti = loan.debtToIncomeRatio ? parseFloat(loan.debtToIncomeRatio) : null;

    if (creditScore < 580) {
      return {
        approved: false,
        declineReason: 'Credit score below minimum threshold (580)',
        notes: `Credit score: ${creditScore}. Minimum required: 580`,
      };
    }

    if (dti && dti > 0.43) {
      return {
        approved: false,
        declineReason: `Debt-to-income ratio exceeds maximum (${(dti * 100).toFixed(1)}% > 43%)`,
        notes: `DTI: ${dti}. Limit: 0.43`,
      };
    }

    const principal = parseFloat(loan.principalAmount);
    if (creditScore < 650 && principal > 50000) {
      return {
        approved: false,
        declineReason: 'Credit score insufficient for requested loan amount',
        notes: `Score ${creditScore} insufficient for $${principal.toLocaleString()} loan`,
      };
    }

    return {
      approved: true,
      notes: `Approved. Credit score: ${creditScore}. DTI: ${dti ?? 'N/A'}`,
    };
  }
}

// Re-export for use in dto
import { LoanType } from '@tpt/database';
