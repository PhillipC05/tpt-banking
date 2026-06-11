import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type LoanStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIAL_RETURN'
  | 'RETURNED'
  | 'RECALLED'
  | 'BOUGHT_IN'
  | 'DEFAULTED';

export type CollateralType = 'CASH' | 'NON_CASH';

export type RebateType = 'REBATE' | 'FEE';    // REBATE = lender pays borrower; FEE = borrower pays lender

export type CorporateActionType =
  | 'DIVIDEND'
  | 'STOCK_SPLIT'
  | 'RIGHTS_ISSUE'
  | 'MERGER'
  | 'SPIN_OFF'
  | 'TENDER_OFFER';

export type BuyInStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED';

// ── Core interfaces ───────────────────────────────────────────────────────────

export interface SecuritiesLoanAgreement {
  agreementId: string;          // Master Securities Lending Agreement (MSLA) reference
  lenderId: string;
  borrowerId: string;
  framework: 'OSLA' | 'GMSLA' | 'MRA' | 'BILATERAL';
  defaultCollateralType: CollateralType;
  cashCollateralCurrency: string;
  reinvestmentRate: string;      // rate on cash collateral reinvestment (GC rate)
  indemnification: boolean;      // broker-dealer indemnification
  status: 'ACTIVE' | 'TERMINATED';
  effectiveDate: string;
  terminationDate: string | null;
}

export interface SecurityLoan {
  loanId: string;
  agreementId: string;
  lenderId: string;
  borrowerId: string;
  isin: string;
  securityDescription: string;
  quantity: string;
  openingQuantity: string;
  settlementDate: string;        // T+2 standard
  openDate: string;
  closeDate: string | null;
  termDate: string | null;       // null = open-ended (call loan)
  collateralType: CollateralType;
  collateralValue: string;       // current collateral held
  collateralMarginPct: string;   // e.g. "102" for 102% collateralisation
  rebateType: RebateType;
  rebateRate: string;            // annualised rate (%)
  lenderFee: string;             // if non-cash collateral (annualised %)
  accrualBasis: '30_360' | 'ACT_360' | 'ACT_365';
  accruedFeeIncome: string;      // accrued to date
  totalFeeIncome: string;        // lifetime
  status: LoanStatus;
  recallQuantity: string | null;
  recallDate: string | null;
  returnHistory: ReturnEvent[];
}

export interface ReturnEvent {
  returnId: string;
  loanId: string;
  returnDate: string;
  returnedQuantity: string;
  collateralReturned: string;
  notes: string;
}

export interface SLABEntry {
  slabId: string;
  isin: string;
  securityDescription: string;
  availableQuantity: string;    // quantity available to lend
  onLoanQuantity: string;       // currently on loan
  utilization: string;          // onLoan / (available + onLoan) %
  indicativeRebateRate: string; // for cash collateral (% p.a.)
  indicativeFee: string;        // for non-cash collateral (bps p.a.)
  demand: 'LOW' | 'NORMAL' | 'HIGH' | 'SPECIAL';  // special = hard-to-borrow
  lastUpdated: string;
}

export interface BuyInNotice {
  buyInId: string;
  loanId: string;
  borrowerId: string;
  isin: string;
  quantity: string;
  buyInDate: string;             // date borrower must deliver or buy-in executes
  buyInPrice: string | null;     // execution price if bought in
  status: BuyInStatus;
  reason: string;
  executedAt: string | null;
  cost: string | null;           // cost charged to borrower
}

export interface CorporateActionEntry {
  caId: string;
  loanId: string;
  isin: string;
  caType: CorporateActionType;
  exDate: string;
  payDate: string;
  manufacturingPaymentAmount: string;  // equivalent payment borrower makes to lender
  currency: string;
  status: 'PENDING' | 'MANUFACTURED' | 'SETTLED';
  notes: string;
}

export interface LendingPortfolioSummary {
  totalLoans: number;
  openLoans: number;
  totalQuantityOnLoan: Record<string, string>;    // ISIN → quantity
  totalCollateralValue: string;
  totalAccruedIncome: string;
  weightedAverageRebateRate: string;
  utilizationByISIN: Record<string, string>;      // ISIN → %
  specialSecurities: string[];                    // ISINs in HIGH/SPECIAL demand
}

// ── SLAB seed data ────────────────────────────────────────────────────────────
const SLAB_SEED: SLABEntry[] = [
  { slabId: uuidv4(), isin: 'US0231351067', securityDescription: 'Amazon.com Inc', availableQuantity: '50000', onLoanQuantity: '0', utilization: '0.00', indicativeRebateRate: '4.85', indicativeFee: '15', demand: 'NORMAL', lastUpdated: new Date().toISOString() },
  { slabId: uuidv4(), isin: 'US88160R1014', securityDescription: 'Tesla Inc', availableQuantity: '100000', onLoanQuantity: '0', utilization: '0.00', indicativeRebateRate: '3.50', indicativeFee: '150', demand: 'HIGH', lastUpdated: new Date().toISOString() },
  { slabId: uuidv4(), isin: 'US5949181045', securityDescription: 'Microsoft Corp', availableQuantity: '200000', onLoanQuantity: '0', utilization: '0.00', indicativeRebateRate: '4.95', indicativeFee: '5', demand: 'LOW', lastUpdated: new Date().toISOString() },
  { slabId: uuidv4(), isin: 'US0378331005', securityDescription: 'Apple Inc', availableQuantity: '300000', onLoanQuantity: '0', utilization: '0.00', indicativeRebateRate: '4.90', indicativeFee: '8', demand: 'LOW', lastUpdated: new Date().toISOString() },
  { slabId: uuidv4(), isin: 'US30303M1027', securityDescription: 'Meta Platforms Inc', availableQuantity: '75000', onLoanQuantity: '0', utilization: '0.00', indicativeRebateRate: '4.75', indicativeFee: '25', demand: 'NORMAL', lastUpdated: new Date().toISOString() },
];

// ── In-memory stores ──────────────────────────────────────────────────────────

const agreementStore  = new Map<string, SecuritiesLoanAgreement>();
const loanStore       = new Map<string, SecurityLoan>();
const slabStore       = new Map<string, SLABEntry>(SLAB_SEED.map((e) => [e.isin, e]));
const buyInStore      = new Map<string, BuyInNotice>();
const caStore         = new Map<string, CorporateActionEntry>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysInYear(basis: SecurityLoan['accrualBasis']): number {
  return basis === 'ACT_365' ? 365 : 360;
}

function accrueIncome(loan: SecurityLoan, toDate: Date): Decimal {
  if (loan.status !== 'OPEN' && loan.status !== 'PARTIAL_RETURN') return new Decimal(0);
  const open   = new Date(loan.openDate);
  const days   = Math.max(0, Math.floor((toDate.getTime() - open.getTime()) / 86_400_000));
  const basis  = daysInYear(loan.accrualBasis);
  const rate   = loan.rebateType === 'FEE'
    ? new Decimal(loan.lenderFee)
    : new Decimal(loan.rebateRate);
  // Income = collateral × rate / daysInYear × days
  return new Decimal(loan.collateralValue)
    .times(rate.dividedBy(100))
    .dividedBy(basis)
    .times(days);
}

function updateSLAB(isin: string, delta: Decimal, direction: 'ON_LOAN' | 'RETURNED'): void {
  const entry = slabStore.get(isin);
  if (!entry) return;

  const onLoan    = new Decimal(entry.onLoanQuantity);
  const available = new Decimal(entry.availableQuantity);

  if (direction === 'ON_LOAN') {
    entry.onLoanQuantity  = onLoan.plus(delta).toFixed(0);
    entry.availableQuantity = Decimal.max(available.minus(delta), new Decimal(0)).toFixed(0);
  } else {
    entry.onLoanQuantity  = Decimal.max(onLoan.minus(delta), new Decimal(0)).toFixed(0);
    entry.availableQuantity = available.plus(delta).toFixed(0);
  }

  const total = new Decimal(entry.onLoanQuantity).plus(new Decimal(entry.availableQuantity));
  entry.utilization = total.isZero()
    ? '0.00'
    : new Decimal(entry.onLoanQuantity).dividedBy(total).times(100).toFixed(2);
  entry.lastUpdated = new Date().toISOString();
  slabStore.set(isin, entry);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SecuritiesLendingService {
  private readonly logger = new Logger(SecuritiesLendingService.name);

  // ── MSLA agreements ───────────────────────────────────────────────────────

  createAgreement(params: Omit<SecuritiesLoanAgreement, 'agreementId' | 'status'>): SecuritiesLoanAgreement {
    const agreement: SecuritiesLoanAgreement = {
      agreementId: uuidv4(),
      status:      'ACTIVE',
      ...params,
    };
    agreementStore.set(agreement.agreementId, agreement);
    this.logger.log(`Securities lending agreement ${agreement.agreementId}: ${agreement.lenderId} → ${agreement.borrowerId} (${agreement.framework})`);
    return agreement;
  }

  getAgreement(agreementId: string): SecuritiesLoanAgreement {
    const a = agreementStore.get(agreementId);
    if (!a) throw new NotFoundException(`Lending agreement ${agreementId} not found`);
    return a;
  }

  listAgreements(lenderId?: string, borrowerId?: string): SecuritiesLoanAgreement[] {
    let all = [...agreementStore.values()];
    if (lenderId)   all = all.filter((a) => a.lenderId === lenderId);
    if (borrowerId) all = all.filter((a) => a.borrowerId === borrowerId);
    return all;
  }

  // ── Loan initiation ───────────────────────────────────────────────────────

  openLoan(params: {
    agreementId: string;
    isin: string;
    securityDescription: string;
    quantity: string;
    collateralType?: CollateralType;
    collateralMarginPct?: string;
    currentSecurityPrice: string;
    rebateType?: RebateType;
    rebateRate?: string;
    lenderFee?: string;
    termDate?: string;
    accrualBasis?: SecurityLoan['accrualBasis'];
  }): SecurityLoan {
    const agreement = this.getAgreement(params.agreementId);
    if (agreement.status !== 'ACTIVE') {
      throw new BadRequestException(`Agreement ${params.agreementId} is not active`);
    }

    const qty            = new Decimal(params.quantity);
    const price          = new Decimal(params.currentSecurityPrice);
    const marginPct      = new Decimal(params.collateralMarginPct ?? '102');
    const collateralValue = qty.times(price).times(marginPct.dividedBy(100));

    const today = new Date();
    const settlementDate = new Date(today);
    settlementDate.setDate(today.getDate() + 2);

    const loan: SecurityLoan = {
      loanId:               uuidv4(),
      agreementId:          params.agreementId,
      lenderId:             agreement.lenderId,
      borrowerId:           agreement.borrowerId,
      isin:                 params.isin,
      securityDescription:  params.securityDescription,
      quantity:             qty.toFixed(0),
      openingQuantity:      qty.toFixed(0),
      settlementDate:       settlementDate.toISOString().split('T')[0]!,
      openDate:             today.toISOString().split('T')[0]!,
      closeDate:            null,
      termDate:             params.termDate ?? null,
      collateralType:       params.collateralType ?? agreement.defaultCollateralType,
      collateralValue:      collateralValue.toFixed(2),
      collateralMarginPct:  marginPct.toFixed(2),
      rebateType:           params.rebateType ?? (params.collateralType === 'NON_CASH' ? 'FEE' : 'REBATE'),
      rebateRate:           params.rebateRate ?? agreement.reinvestmentRate,
      lenderFee:            params.lenderFee ?? '0',
      accrualBasis:         params.accrualBasis ?? 'ACT_360',
      accruedFeeIncome:     '0.00',
      totalFeeIncome:       '0.00',
      status:               'OPEN',
      recallQuantity:       null,
      recallDate:           null,
      returnHistory:        [],
    };

    loanStore.set(loan.loanId, loan);
    updateSLAB(params.isin, qty, 'ON_LOAN');

    this.logger.log(`Loan ${loan.loanId} opened: ${qty.toFixed(0)} ${params.isin} — collateral ${collateralValue.toFixed(2)}`);
    return loan;
  }

  getLoan(loanId: string): SecurityLoan {
    const l = loanStore.get(loanId);
    if (!l) throw new NotFoundException(`Loan ${loanId} not found`);
    return l;
  }

  listLoans(lenderId?: string, borrowerId?: string, status?: LoanStatus): SecurityLoan[] {
    let all = [...loanStore.values()];
    if (lenderId)   all = all.filter((l) => l.lenderId === lenderId);
    if (borrowerId) all = all.filter((l) => l.borrowerId === borrowerId);
    if (status)     all = all.filter((l) => l.status === status);
    return all;
  }

  // ── Returns ───────────────────────────────────────────────────────────────

  returnLoan(loanId: string, params: {
    returnedQuantity: string;
    notes?: string;
  }): SecurityLoan {
    const loan = this.getLoan(loanId);
    if (loan.status !== 'OPEN' && loan.status !== 'PARTIAL_RETURN' && loan.status !== 'RECALLED') {
      throw new BadRequestException(`Loan ${loanId} cannot be returned in status ${loan.status}`);
    }

    const returnQty = new Decimal(params.returnedQuantity);
    const currentQty = new Decimal(loan.quantity);

    if (returnQty.gt(currentQty)) {
      throw new BadRequestException(
        `Return quantity ${returnQty.toFixed(0)} exceeds outstanding ${currentQty.toFixed(0)}`,
      );
    }

    // Accrue income to date of return
    const accrued = accrueIncome(loan, new Date());
    loan.accruedFeeIncome = accrued.toFixed(2);
    loan.totalFeeIncome   = new Decimal(loan.totalFeeIncome).plus(accrued).toFixed(2);

    // Calculate collateral to return
    const returnFraction   = returnQty.dividedBy(currentQty);
    const collateralReturn = new Decimal(loan.collateralValue).times(returnFraction);

    const returnEvt: ReturnEvent = {
      returnId:           uuidv4(),
      loanId,
      returnDate:         new Date().toISOString().split('T')[0]!,
      returnedQuantity:   returnQty.toFixed(0),
      collateralReturned: collateralReturn.toFixed(2),
      notes:              params.notes ?? '',
    };
    loan.returnHistory.push(returnEvt);

    const remainingQty = currentQty.minus(returnQty);
    loan.quantity         = remainingQty.toFixed(0);
    loan.collateralValue  = new Decimal(loan.collateralValue).minus(collateralReturn).toFixed(2);

    if (remainingQty.isZero()) {
      loan.status    = 'RETURNED';
      loan.closeDate = new Date().toISOString().split('T')[0]!;
    } else {
      loan.status = 'PARTIAL_RETURN';
    }

    loanStore.set(loanId, loan);
    updateSLAB(loan.isin, returnQty, 'RETURNED');

    this.logger.log(`Return on loan ${loanId}: ${returnQty.toFixed(0)} shares returned. Remaining: ${remainingQty.toFixed(0)}`);
    return loan;
  }

  // ── Recall ────────────────────────────────────────────────────────────────

  recallLoan(loanId: string, params: {
    recallQuantity: string;
    recallDate?: string;
  }): SecurityLoan {
    const loan = this.getLoan(loanId);
    if (loan.status !== 'OPEN' && loan.status !== 'PARTIAL_RETURN') {
      throw new BadRequestException(`Loan ${loanId} cannot be recalled in status ${loan.status}`);
    }

    const recallQty = new Decimal(params.recallQuantity);
    if (recallQty.gt(new Decimal(loan.quantity))) {
      throw new BadRequestException('Recall quantity exceeds outstanding loan quantity');
    }

    // Standard recall: borrower has until next business day (T+1) to return
    const recallDate = params.recallDate ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0]!;
    })();

    loan.status         = 'RECALLED';
    loan.recallQuantity = recallQty.toFixed(0);
    loan.recallDate     = recallDate;
    loanStore.set(loanId, loan);

    this.logger.log(`Recall issued on loan ${loanId}: ${recallQty.toFixed(0)} shares by ${recallDate}`);
    return loan;
  }

  // ── Buy-in ────────────────────────────────────────────────────────────────

  initiateBuyIn(loanId: string, params: {
    quantity: string;
    reason: string;
    buyInDate?: string;
  }): BuyInNotice {
    const loan = this.getLoan(loanId);

    const buyInDate = params.buyInDate ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);   // T+3 standard buy-in notice period
      return d.toISOString().split('T')[0]!;
    })();

    const notice: BuyInNotice = {
      buyInId:     uuidv4(),
      loanId,
      borrowerId:  loan.borrowerId,
      isin:        loan.isin,
      quantity:    new Decimal(params.quantity).toFixed(0),
      buyInDate,
      buyInPrice:  null,
      status:      'PENDING',
      reason:      params.reason,
      executedAt:  null,
      cost:        null,
    };
    buyInStore.set(notice.buyInId, notice);
    this.logger.log(`Buy-in ${notice.buyInId} initiated for loan ${loanId}: ${params.quantity} ${loan.isin} by ${buyInDate}`);
    return notice;
  }

  executeBuyIn(buyInId: string, params: {
    executionPrice: string;
    marketCost: string;   // total cost to buy securities in market
  }): BuyInNotice {
    const notice = buyInStore.get(buyInId);
    if (!notice) throw new NotFoundException(`Buy-in notice ${buyInId} not found`);
    if (notice.status !== 'PENDING') {
      throw new BadRequestException(`Buy-in ${buyInId} is in status ${notice.status}`);
    }

    notice.status      = 'EXECUTED';
    notice.buyInPrice  = new Decimal(params.executionPrice).toFixed(6);
    notice.cost        = new Decimal(params.marketCost).toFixed(2);
    notice.executedAt  = new Date().toISOString();
    buyInStore.set(buyInId, notice);

    // Close the underlying loan
    const loan = loanStore.get(notice.loanId);
    if (loan) {
      loan.status    = 'BOUGHT_IN';
      loan.closeDate = new Date().toISOString().split('T')[0]!;
      loanStore.set(notice.loanId, loan);
      updateSLAB(loan.isin, new Decimal(notice.quantity), 'RETURNED');
    }

    this.logger.log(`Buy-in ${buyInId} executed at ${params.executionPrice}, cost ${params.marketCost}`);
    return notice;
  }

  listBuyIns(loanId?: string): BuyInNotice[] {
    const all = [...buyInStore.values()];
    return loanId ? all.filter((b) => b.loanId === loanId) : all;
  }

  // ── Corporate actions (manufactured payments) ─────────────────────────────

  recordCorporateAction(loanId: string, params: {
    caType: CorporateActionType;
    exDate: string;
    payDate: string;
    manufacturingPaymentAmount: string;
    currency: string;
    notes?: string;
  }): CorporateActionEntry {
    const loan = this.getLoan(loanId);

    const ca: CorporateActionEntry = {
      caId:                       uuidv4(),
      loanId,
      isin:                       loan.isin,
      caType:                     params.caType,
      exDate:                     params.exDate,
      payDate:                    params.payDate,
      manufacturingPaymentAmount: new Decimal(params.manufacturingPaymentAmount).toFixed(2),
      currency:                   params.currency,
      status:                     'PENDING',
      notes:                      params.notes ?? '',
    };
    caStore.set(ca.caId, ca);
    this.logger.log(`Corporate action ${ca.caId} (${params.caType}) on loan ${loanId}: manufactured payment ${params.manufacturingPaymentAmount} ${params.currency}`);
    return ca;
  }

  manufacturePayment(caId: string): CorporateActionEntry {
    const ca = caStore.get(caId);
    if (!ca) throw new NotFoundException(`Corporate action ${caId} not found`);
    if (ca.status !== 'PENDING') {
      throw new BadRequestException(`Corporate action ${caId} is not pending`);
    }
    ca.status = 'MANUFACTURED';
    caStore.set(caId, ca);
    return ca;
  }

  settleCorporateAction(caId: string): CorporateActionEntry {
    const ca = caStore.get(caId);
    if (!ca) throw new NotFoundException(`Corporate action ${caId} not found`);
    ca.status = 'SETTLED';
    caStore.set(caId, ca);
    return ca;
  }

  // ── SLAB (Securities Lending Availability Board) ──────────────────────────

  getSLAB(): SLABEntry[] {
    return [...slabStore.values()].sort((a, b) => {
      const demandOrder = { SPECIAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
      return demandOrder[a.demand] - demandOrder[b.demand];
    });
  }

  getSLABEntry(isin: string): SLABEntry {
    const e = slabStore.get(isin);
    if (!e) throw new NotFoundException(`No SLAB entry for ISIN ${isin}`);
    return e;
  }

  addSLABEntry(params: {
    isin: string;
    securityDescription: string;
    availableQuantity: string;
    indicativeRebateRate: string;
    indicativeFee: string;
    demand: SLABEntry['demand'];
  }): SLABEntry {
    const entry: SLABEntry = {
      slabId:               uuidv4(),
      isin:                 params.isin,
      securityDescription:  params.securityDescription,
      availableQuantity:    params.availableQuantity,
      onLoanQuantity:       '0',
      utilization:          '0.00',
      indicativeRebateRate: params.indicativeRebateRate,
      indicativeFee:        params.indicativeFee,
      demand:               params.demand,
      lastUpdated:          new Date().toISOString(),
    };
    slabStore.set(params.isin, entry);
    return entry;
  }

  // ── Income accrual ────────────────────────────────────────────────────────

  accrueAllLoans(): { loanId: string; isin: string; accruedToDate: string }[] {
    const results: { loanId: string; isin: string; accruedToDate: string }[] = [];
    const today = new Date();

    for (const loan of loanStore.values()) {
      if (loan.status !== 'OPEN' && loan.status !== 'PARTIAL_RETURN') continue;
      const accrued      = accrueIncome(loan, today);
      loan.accruedFeeIncome = accrued.toFixed(2);
      loanStore.set(loan.loanId, loan);
      results.push({ loanId: loan.loanId, isin: loan.isin, accruedToDate: accrued.toFixed(2) });
    }
    return results;
  }

  // ── Portfolio summary ─────────────────────────────────────────────────────

  getLendingPortfolioSummary(lenderId?: string): LendingPortfolioSummary {
    const loans = lenderId
      ? this.listLoans(lenderId, undefined)
      : [...loanStore.values()];

    const openLoans = loans.filter(
      (l) => l.status === 'OPEN' || l.status === 'PARTIAL_RETURN' || l.status === 'RECALLED',
    );

    const quantityOnLoan: Record<string, Decimal> = {};
    let totalCollateral = new Decimal(0);
    let totalAccrued    = new Decimal(0);
    let rateWeightedSum = new Decimal(0);
    let totalValue      = new Decimal(0);

    for (const loan of openLoans) {
      if (!quantityOnLoan[loan.isin]) quantityOnLoan[loan.isin] = new Decimal(0);
      quantityOnLoan[loan.isin] = quantityOnLoan[loan.isin]!.plus(new Decimal(loan.quantity));
      totalCollateral = totalCollateral.plus(new Decimal(loan.collateralValue));
      totalAccrued    = totalAccrued.plus(new Decimal(loan.accruedFeeIncome));
      rateWeightedSum = rateWeightedSum.plus(
        new Decimal(loan.rebateRate).times(new Decimal(loan.collateralValue)),
      );
      totalValue = totalValue.plus(new Decimal(loan.collateralValue));
    }

    const waRate = totalValue.isZero()
      ? new Decimal(0)
      : rateWeightedSum.dividedBy(totalValue);

    const qtyOut: Record<string, string> = {};
    for (const [isin, qty] of Object.entries(quantityOnLoan)) {
      qtyOut[isin] = qty.toFixed(0);
    }

    const utilByISIN: Record<string, string> = {};
    for (const entry of slabStore.values()) {
      utilByISIN[entry.isin] = entry.utilization;
    }

    const specials = [...slabStore.values()]
      .filter((e) => e.demand === 'SPECIAL' || e.demand === 'HIGH')
      .map((e) => e.isin);

    return {
      totalLoans:                loans.length,
      openLoans:                 openLoans.length,
      totalQuantityOnLoan:       qtyOut,
      totalCollateralValue:      totalCollateral.toFixed(2),
      totalAccruedIncome:        totalAccrued.toFixed(2),
      weightedAverageRebateRate: waRate.toFixed(4),
      utilizationByISIN:         utilByISIN,
      specialSecurities:         specials,
    };
  }
}
