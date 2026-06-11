import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  PrimeBrokerageService,
  PBAccountType,
  FinancingType,
  SyntheticType,
} from './prime-brokerage.service';

@ApiTags('Prime Brokerage')
@ApiBearerAuth('access-token')
@Controller('prime-brokerage')
export class PrimeBrokerageController {
  constructor(private readonly svc: PrimeBrokerageService) {}

  // ── PB Accounts ────────────────────────────────────────────────────────────

  @Post('accounts')
  @ApiOperation({ summary: 'Open a new prime brokerage account for a hedge fund / family office / pension client' })
  openPBAccount(
    @Body() body: {
      clientId: string;
      clientName: string;
      accountType: PBAccountType;
      currency: string;
      netAssetValue: string;
      maximumLeverage: string;
      rehypothecationEnabled?: boolean;
      rehypothecationLimit?: string;
      custodian: string;
      primebroker: string;
    },
  ) {
    return this.svc.openPBAccount(body);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List all PB accounts, optionally filtered by type or status' })
  @ApiQuery({ name: 'accountType', required: false })
  @ApiQuery({ name: 'status', required: false })
  listAccounts(
    @Query('accountType') accountType?: PBAccountType,
    @Query('status') status?: 'ACTIVE' | 'RESTRICTED' | 'WIND_DOWN' | 'CLOSED',
  ) {
    return this.svc.listPBAccounts(accountType, status);
  }

  @Get('accounts/:pbAccountId')
  @ApiOperation({ summary: 'Get a PB account with live leverage and margin metrics' })
  getAccount(@Param('pbAccountId') pbAccountId: string) {
    return this.svc.getPBAccount(pbAccountId);
  }

  @Patch('accounts/:pbAccountId/nav')
  @ApiOperation({ summary: 'Update NAV and recalculate leverage / margin requirements' })
  updateNAV(
    @Param('pbAccountId') pbAccountId: string,
    @Body() body: { netAssetValue: string },
  ) {
    return this.svc.updateNAV(pbAccountId, body.netAssetValue);
  }

  // ── Positions ─────────────────────────────────────────────────────────────

  @Post('accounts/:pbAccountId/positions')
  @ApiOperation({ summary: 'Add a long or short position to a PB account — recalculates account leverage' })
  addPosition(
    @Param('pbAccountId') pbAccountId: string,
    @Body() body: {
      isin: string;
      description: string;
      side: 'LONG' | 'SHORT';
      quantity: string;
      averageCost: string;
      currentPrice: string;
      financingType?: FinancingType;
      financingRate?: string;
    },
  ) {
    return this.svc.addPosition(pbAccountId, body);
  }

  @Get('accounts/:pbAccountId/positions')
  @ApiOperation({ summary: 'List all positions in a PB account with PnL, haircuts, and financing' })
  listPositions(@Param('pbAccountId') pbAccountId: string) {
    return this.svc.listPositions(pbAccountId);
  }

  @Patch('positions/:positionId/price')
  @ApiOperation({ summary: 'Mark position to market — updates MV, unrealized PnL, and account leverage' })
  updatePrice(
    @Param('positionId') positionId: string,
    @Body() body: { currentPrice: string; dayPnL?: string },
  ) {
    return this.svc.updatePositionPrice(positionId, body.currentPrice, body.dayPnL);
  }

  // ── Synthetic Exposure ────────────────────────────────────────────────────

  @Post('accounts/:pbAccountId/synthetics')
  @ApiOperation({ summary: 'Add a synthetic position (TRS or CFD) providing long/short exposure without physical ownership' })
  addSynthetic(
    @Param('pbAccountId') pbAccountId: string,
    @Body() body: {
      syntheticType: SyntheticType;
      underlyingISIN: string;
      underlyingDescription: string;
      notionalValue: string;
      currentPrice: string;
      entryPrice: string;
      totalReturnRate: string;
      counterpartyId: string;
      terminationDate?: string;
      accrualBasis?: 'ACT_360' | 'ACT_365';
    },
  ) {
    return this.svc.addSyntheticPosition(pbAccountId, body);
  }

  @Get('accounts/:pbAccountId/synthetics')
  @ApiOperation({ summary: 'List active synthetic positions (TRS/CFD) for a PB account' })
  listSynthetics(@Param('pbAccountId') pbAccountId: string) {
    return this.svc.listSynthetics(pbAccountId);
  }

  @Post('synthetics/:syntheticId/terminate')
  @ApiOperation({ summary: 'Terminate a synthetic position (TRS / CFD)' })
  terminateSynthetic(@Param('syntheticId') syntheticId: string) {
    return this.svc.terminateSynthetic(syntheticId);
  }

  // ── Financing Facilities ──────────────────────────────────────────────────

  @Post('accounts/:pbAccountId/facilities')
  @ApiOperation({ summary: 'Create a financing facility (margin loan, repo, TRS, CFD, or securities borrow)' })
  createFacility(
    @Param('pbAccountId') pbAccountId: string,
    @Body() body: {
      financingType: FinancingType;
      currency: string;
      facilityLimit: string;
      rate: string;
      rateReference: string;
      collateralISINs?: string[];
      maturityDate?: string;
    },
  ) {
    return this.svc.createFinancingFacility(pbAccountId, body);
  }

  @Get('accounts/:pbAccountId/facilities')
  @ApiOperation({ summary: 'List financing facilities for a PB account' })
  listFacilities(@Param('pbAccountId') pbAccountId: string) {
    return this.svc.listFacilities(pbAccountId);
  }

  @Post('facilities/:facilityId/draw')
  @ApiOperation({ summary: 'Draw from a financing facility — increases debit balance and reduces available capacity' })
  drawFacility(
    @Param('facilityId') facilityId: string,
    @Body() body: { amount: string },
  ) {
    return this.svc.drawFacility(facilityId, body.amount);
  }

  // ── Rehypothecation ───────────────────────────────────────────────────────

  @Post('accounts/:pbAccountId/rehypothecation')
  @ApiOperation({ summary: 'Rehypothecate a client position — only allowed if rehypothecation is enabled on the account' })
  rehypothecate(
    @Param('pbAccountId') pbAccountId: string,
    @Body() body: {
      sourcePositionId: string;
      quantity: string;
      usedFor: string;
      counterpartyId: string;
      rate: string;
      maturityDate?: string;
    },
  ) {
    return this.svc.rehypothecatePosition({ pbAccountId, ...body });
  }

  @Get('accounts/:pbAccountId/rehypothecation')
  @ApiOperation({ summary: 'List rehypothecation records for a PB account' })
  listRehyps(@Param('pbAccountId') pbAccountId: string) {
    return this.svc.listRehypothecations(pbAccountId);
  }

  @Post('rehypothecation/:rehypId/return')
  @ApiOperation({ summary: 'Return rehypothecated assets to the client' })
  returnRehyp(@Param('rehypId') rehypId: string) {
    return this.svc.returnRehypothecation(rehypId);
  }

  // ── Daily Reports ─────────────────────────────────────────────────────────

  @Post('accounts/:pbAccountId/reports')
  @ApiOperation({ summary: 'Generate a daily PB report: NAV, leverage, margin usage, top positions, synthetic exposure, rehypothecation' })
  generateReport(
    @Param('pbAccountId') pbAccountId: string,
    @Body() body: { mtdPnL: string; ytdPnL: string },
  ) {
    return this.svc.generateDailyReport(pbAccountId, body);
  }

  @Get('accounts/:pbAccountId/reports')
  @ApiOperation({ summary: 'List all PB reports for an account, newest first' })
  listReports(@Param('pbAccountId') pbAccountId: string) {
    return this.svc.listReports(pbAccountId);
  }

  @Get('reports/:reportId')
  @ApiOperation({ summary: 'Get a specific PB daily report by ID' })
  getReport(@Param('reportId') reportId: string) {
    return this.svc.getReport(reportId);
  }

  // ── Book Summary ──────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Prime brokerage book summary: total NAV, gross exposure, synthetic notional, leverage, accounts in margin call' })
  getBookSummary() {
    return this.svc.getBookSummary();
  }
}
