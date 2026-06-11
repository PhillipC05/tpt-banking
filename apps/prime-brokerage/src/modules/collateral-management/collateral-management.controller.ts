import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  CollateralManagementService,
  CollateralAssetType,
  CollateralStatus,
  EligibilitySchedule,
  PledgeStatus,
} from './collateral-management.service';

@ApiTags('Collateral Management')
@ApiBearerAuth('access-token')
@Controller('collateral')
export class CollateralManagementController {
  constructor(private readonly svc: CollateralManagementService) {}

  // ── Assets ────────────────────────────────────────────────────────────────

  @Post('assets')
  @ApiOperation({ summary: 'Register a collateral asset in the inventory (bonds, equities, cash, LC)' })
  registerAsset(
    @Body() body: {
      counterpartyId: string;
      portfolioId: string;
      isin: string;
      description: string;
      assetType: CollateralAssetType;
      currency: string;
      nominalQuantity: string;
      currentPrice: string;
      accruedInterest?: string;
      maturityDate?: string;
      couponRate?: string;
      creditRating?: string;
      residualMaturityYears?: number;
      eligibleSchedules: EligibilitySchedule[];
      custodian: string;
      custodianAccountId: string;
    },
  ) {
    return this.svc.registerAsset(body);
  }

  @Get('assets')
  @ApiOperation({ summary: 'List collateral assets, optionally filtered by counterparty and status' })
  @ApiQuery({ name: 'counterpartyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listAssets(
    @Query('counterpartyId') counterpartyId?: string,
    @Query('status') status?: CollateralStatus,
  ) {
    return this.svc.listAssets(counterpartyId, status);
  }

  @Get('assets/:assetId')
  @ApiOperation({ summary: 'Get a specific collateral asset' })
  getAsset(@Param('assetId') assetId: string) {
    return this.svc.getAsset(assetId);
  }

  @Patch('assets/:assetId/price')
  @ApiOperation({ summary: 'Update asset price (mark-to-market) and recalculate market/dirty values' })
  updatePrice(
    @Param('assetId') assetId: string,
    @Body() body: { currentPrice: string; accruedInterest?: string },
  ) {
    return this.svc.updateAssetPrice(assetId, body.currentPrice, body.accruedInterest);
  }

  // ── Haircuts ──────────────────────────────────────────────────────────────

  @Get('assets/:assetId/haircut')
  @ApiOperation({ summary: 'Calculate haircut and eligible value for an asset under a specific schedule' })
  @ApiQuery({ name: 'schedule', enum: ['ISDA_VM', 'ISDA_IM', 'EUREX_CLEARING', 'LCH_CLEARNET', 'CME_CLEARING', 'BILATERAL'] })
  getHaircut(
    @Param('assetId') assetId: string,
    @Query('schedule') schedule: EligibilitySchedule,
  ) {
    return this.svc.calculateHaircut(assetId, schedule);
  }

  @Get('haircuts/portfolio')
  @ApiOperation({ summary: 'Calculate haircuts for all available assets of a counterparty under a schedule' })
  @ApiQuery({ name: 'counterpartyId', required: true })
  @ApiQuery({ name: 'schedule', required: true })
  getPortfolioHaircuts(
    @Query('counterpartyId') counterpartyId: string,
    @Query('schedule') schedule: EligibilitySchedule,
  ) {
    return this.svc.calculateHaircutsForPortfolio(counterpartyId, schedule);
  }

  // ── Pledges ───────────────────────────────────────────────────────────────

  @Post('pledges')
  @ApiOperation({ summary: 'Create a new collateral pledge for a margin/CSA/GMRA agreement' })
  createPledge(
    @Body() body: {
      counterpartyId: string;
      agreementId: string;
      schedule: EligibilitySchedule;
      assetAllocations: Array<{ assetId: string; quantity: string }>;
      requiredCollateralValue: string;
      expiryDate?: string;
    },
  ) {
    return this.svc.createPledge(body);
  }

  @Get('pledges')
  @ApiOperation({ summary: 'List pledges, optionally filtered by counterparty and status' })
  @ApiQuery({ name: 'counterpartyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listPledges(
    @Query('counterpartyId') counterpartyId?: string,
    @Query('status') status?: PledgeStatus,
  ) {
    return this.svc.listPledges(counterpartyId, status);
  }

  @Get('pledges/:pledgeId')
  @ApiOperation({ summary: 'Get a specific pledge with all pledged assets and eligibility metrics' })
  getPledge(@Param('pledgeId') pledgeId: string) {
    return this.svc.getPledge(pledgeId);
  }

  @Post('pledges/:pledgeId/release')
  @ApiOperation({ summary: 'Release a pledge fully, or release a single asset from it' })
  releasePledge(
    @Param('pledgeId') pledgeId: string,
    @Body() body: { assetId?: string },
  ) {
    return this.svc.releasePledge(pledgeId, body.assetId ? { assetId: body.assetId } : undefined);
  }

  // ── Substitution ──────────────────────────────────────────────────────────

  @Post('substitutions')
  @ApiOperation({ summary: 'Request a collateral substitution (swap one pledged asset for another)' })
  requestSubstitution(
    @Body() body: {
      pledgeId: string;
      outAssetId: string;
      inAssetId: string;
      outQuantity: string;
      inQuantity: string;
      reason: string;
    },
  ) {
    return this.svc.requestSubstitution(body);
  }

  @Post('substitutions/:requestId/settle')
  @ApiOperation({ summary: 'Settle a substitution request — updates pledge and releases out-asset' })
  settleSubstitution(@Param('requestId') requestId: string) {
    return this.svc.settleSubstitution(requestId);
  }

  @Get('substitutions')
  @ApiOperation({ summary: 'List substitution requests, optionally filtered by pledge' })
  @ApiQuery({ name: 'pledgeId', required: false })
  listSubstitutions(@Query('pledgeId') pledgeId?: string) {
    return this.svc.listSubstitutions(pledgeId);
  }

  // ── Optimization ─────────────────────────────────────────────────────────

  @Post('optimize')
  @ApiOperation({ summary: 'Cheapest-to-deliver optimization: selects assets to meet a collateral requirement at minimum opportunity cost' })
  optimize(
    @Body() body: {
      counterpartyId: string;
      requiredValue: string;
      schedule: EligibilitySchedule;
    },
  ) {
    return this.svc.optimizeCollateral(body);
  }

  // ── Inventory summary ─────────────────────────────────────────────────────

  @Get('inventory/summary')
  @ApiOperation({ summary: 'Inventory summary: by status, by asset type, total and pledged vs. available value' })
  @ApiQuery({ name: 'counterpartyId', required: false })
  getInventorySummary(@Query('counterpartyId') counterpartyId?: string) {
    return this.svc.getInventorySummary(counterpartyId);
  }
}
