import {
  Controller, Get, Post, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  SecuritiesLendingService,
  LoanStatus,
  CollateralType,
  RebateType,
  CorporateActionType,
} from './securities-lending.service';

@ApiTags('Securities Lending')
@ApiBearerAuth('access-token')
@Controller('securities-lending')
export class SecuritiesLendingController {
  constructor(private readonly svc: SecuritiesLendingService) {}

  // ── MSLA Agreements ───────────────────────────────────────────────────────

  @Post('agreements')
  @ApiOperation({ summary: 'Create a Master Securities Lending Agreement (MSLA/GMSLA/OSLA)' })
  createAgreement(
    @Body() body: {
      lenderId: string;
      borrowerId: string;
      framework: 'OSLA' | 'GMSLA' | 'MRA' | 'BILATERAL';
      defaultCollateralType: CollateralType;
      cashCollateralCurrency: string;
      reinvestmentRate: string;
      indemnification: boolean;
      effectiveDate: string;
      terminationDate?: string;
    },
  ) {
    return this.svc.createAgreement(body);
  }

  @Get('agreements')
  @ApiOperation({ summary: 'List lending agreements' })
  @ApiQuery({ name: 'lenderId', required: false })
  @ApiQuery({ name: 'borrowerId', required: false })
  listAgreements(
    @Query('lenderId') lenderId?: string,
    @Query('borrowerId') borrowerId?: string,
  ) {
    return this.svc.listAgreements(lenderId, borrowerId);
  }

  @Get('agreements/:agreementId')
  @ApiOperation({ summary: 'Get a specific lending agreement' })
  getAgreement(@Param('agreementId') agreementId: string) {
    return this.svc.getAgreement(agreementId);
  }

  // ── Loans ─────────────────────────────────────────────────────────────────

  @Post('loans')
  @ApiOperation({ summary: 'Open a new securities loan — calculates collateral (102% default), rebate accrual' })
  openLoan(
    @Body() body: {
      agreementId: string;
      isin: string;
      securityDescription: string;
      quantity: string;
      currentSecurityPrice: string;
      collateralType?: CollateralType;
      collateralMarginPct?: string;
      rebateType?: RebateType;
      rebateRate?: string;
      lenderFee?: string;
      termDate?: string;
      accrualBasis?: 'ACT_360' | 'ACT_365' | '30_360';
    },
  ) {
    return this.svc.openLoan(body);
  }

  @Get('loans')
  @ApiOperation({ summary: 'List loans, filtered by lender, borrower, or status' })
  @ApiQuery({ name: 'lenderId', required: false })
  @ApiQuery({ name: 'borrowerId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listLoans(
    @Query('lenderId') lenderId?: string,
    @Query('borrowerId') borrowerId?: string,
    @Query('status') status?: LoanStatus,
  ) {
    return this.svc.listLoans(lenderId, borrowerId, status);
  }

  @Get('loans/:loanId')
  @ApiOperation({ summary: 'Get a specific loan with return history and accruals' })
  getLoan(@Param('loanId') loanId: string) {
    return this.svc.getLoan(loanId);
  }

  // ── Returns ───────────────────────────────────────────────────────────────

  @Post('loans/:loanId/return')
  @ApiOperation({ summary: 'Record a full or partial return of borrowed securities' })
  returnLoan(
    @Param('loanId') loanId: string,
    @Body() body: { returnedQuantity: string; notes?: string },
  ) {
    return this.svc.returnLoan(loanId, body);
  }

  // ── Recall ────────────────────────────────────────────────────────────────

  @Post('loans/:loanId/recall')
  @ApiOperation({ summary: 'Issue a recall — borrower must return securities by recall date (default T+1)' })
  recallLoan(
    @Param('loanId') loanId: string,
    @Body() body: { recallQuantity: string; recallDate?: string },
  ) {
    return this.svc.recallLoan(loanId, body);
  }

  // ── Buy-ins ───────────────────────────────────────────────────────────────

  @Post('loans/:loanId/buy-in')
  @ApiOperation({ summary: 'Initiate a buy-in notice against a recalled or overdue loan' })
  initiateBuyIn(
    @Param('loanId') loanId: string,
    @Body() body: { quantity: string; reason: string; buyInDate?: string },
  ) {
    return this.svc.initiateBuyIn(loanId, body);
  }

  @Post('buy-ins/:buyInId/execute')
  @ApiOperation({ summary: 'Execute a buy-in at market price — closes the underlying loan' })
  executeBuyIn(
    @Param('buyInId') buyInId: string,
    @Body() body: { executionPrice: string; marketCost: string },
  ) {
    return this.svc.executeBuyIn(buyInId, body);
  }

  @Get('buy-ins')
  @ApiOperation({ summary: 'List buy-in notices, optionally filtered by loan' })
  @ApiQuery({ name: 'loanId', required: false })
  listBuyIns(@Query('loanId') loanId?: string) {
    return this.svc.listBuyIns(loanId);
  }

  // ── Corporate Actions (manufactured payments) ─────────────────────────────

  @Post('loans/:loanId/corporate-actions')
  @ApiOperation({ summary: 'Record a corporate action — borrower must manufacture equivalent payment to lender' })
  recordCA(
    @Param('loanId') loanId: string,
    @Body() body: {
      caType: CorporateActionType;
      exDate: string;
      payDate: string;
      manufacturingPaymentAmount: string;
      currency: string;
      notes?: string;
    },
  ) {
    return this.svc.recordCorporateAction(loanId, body);
  }

  @Post('corporate-actions/:caId/manufacture')
  @ApiOperation({ summary: 'Mark a corporate action manufactured payment as sent by borrower' })
  manufacturePayment(@Param('caId') caId: string) {
    return this.svc.manufacturePayment(caId);
  }

  @Post('corporate-actions/:caId/settle')
  @ApiOperation({ summary: 'Mark a corporate action manufacturing payment as settled' })
  settleCA(@Param('caId') caId: string) {
    return this.svc.settleCorporateAction(caId);
  }

  // ── SLAB ─────────────────────────────────────────────────────────────────

  @Get('slab')
  @ApiOperation({ summary: 'Securities Lending Availability Board — demand, rates, utilization sorted by demand (SPECIAL first)' })
  getSLAB() {
    return this.svc.getSLAB();
  }

  @Get('slab/:isin')
  @ApiOperation({ summary: 'Get SLAB entry for a specific ISIN' })
  getSLABEntry(@Param('isin') isin: string) {
    return this.svc.getSLABEntry(isin);
  }

  @Post('slab')
  @ApiOperation({ summary: 'Add a new security to the SLAB' })
  addSLABEntry(
    @Body() body: {
      isin: string;
      securityDescription: string;
      availableQuantity: string;
      indicativeRebateRate: string;
      indicativeFee: string;
      demand: 'LOW' | 'NORMAL' | 'HIGH' | 'SPECIAL';
    },
  ) {
    return this.svc.addSLABEntry(body);
  }

  // ── Accruals & Portfolio ──────────────────────────────────────────────────

  @Post('accrue')
  @ApiOperation({ summary: 'Run income accrual for all open loans to today' })
  accrueAll() {
    return this.svc.accrueAllLoans();
  }

  @Get('portfolio/summary')
  @ApiOperation({ summary: 'Lending portfolio summary: open loans, collateral, accrued income, utilization, specials' })
  @ApiQuery({ name: 'lenderId', required: false })
  getPortfolioSummary(@Query('lenderId') lenderId?: string) {
    return this.svc.getLendingPortfolioSummary(lenderId);
  }
}
