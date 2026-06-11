import {
  Controller, Get, Post, Param, Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RoboAdvisorService, AssetClass, RebalancingPlan } from './robo-advisor.service';

@ApiTags('Robo-Advisor')
@ApiBearerAuth('access-token')
@Controller('robo-advisor')
export class RoboAdvisorController {
  constructor(private readonly svc: RoboAdvisorService) {}

  // ── Model Portfolios ──────────────────────────────────────────────────────

  @Get('models')
  @ApiOperation({ summary: 'List all model portfolios (Conservative → Aggressive) with target allocations' })
  listModels() {
    return this.svc.listModels();
  }

  @Get('models/:modelId')
  @ApiOperation({ summary: 'Get a specific model portfolio' })
  getModel(@Param('modelId') modelId: string) {
    return this.svc.getModel(modelId);
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  @Post('accounts')
  @ApiOperation({ summary: 'Enroll a customer in the robo-advisor with a selected model portfolio' })
  enrollAccount(
    @Body() body: {
      customerId: string;
      modelPortfolioId: string;
      driftThresholdPct?: number;
      autoRebalanceEnabled?: boolean;
    },
  ) {
    return this.svc.enrollAccount(body);
  }

  @Get('accounts/:accountId')
  @ApiOperation({ summary: 'Get a robo account with current holdings and metrics' })
  getAccount(@Param('accountId') accountId: string) {
    return this.svc.getAccount(accountId);
  }

  @Post('accounts/:accountId/holdings')
  @ApiOperation({ summary: 'Update account holdings snapshot (market values, quantities, prices)' })
  updateHoldings(
    @Param('accountId') accountId: string,
    @Body() body: {
      holdings: {
        symbol: string;
        name: string;
        assetClass: AssetClass;
        quantity: string;
        currentPrice: string;
        costBasis: string;
        purchaseDate: string;
      }[];
    },
  ) {
    return this.svc.updateHoldings(accountId, body.holdings);
  }

  // ── Drift & Rebalancing ───────────────────────────────────────────────────

  @Get('accounts/:accountId/drift')
  @ApiOperation({ summary: 'Check allocation drift vs model target — returns per-asset-class deviation' })
  checkDrift(@Param('accountId') accountId: string) {
    return this.svc.checkDrift(accountId);
  }

  @Post('accounts/:accountId/rebalance')
  @ApiOperation({ summary: 'Generate a rebalancing plan for drift or scheduled rebalance' })
  generatePlan(
    @Param('accountId') accountId: string,
    @Body() body: { reason?: RebalancingPlan['reason'] },
  ) {
    return this.svc.generateRebalancingPlan(accountId, body.reason);
  }

  @Post('accounts/:accountId/rebalance/:planId/execute')
  @ApiOperation({ summary: 'Mark a rebalancing plan as executed' })
  executePlan(
    @Param('accountId') accountId: string,
    @Param('planId') planId: string,
  ) {
    return this.svc.executePlan(accountId, planId);
  }

  @Get('accounts/:accountId/rebalance')
  @ApiOperation({ summary: 'List all rebalancing plans for an account' })
  getPlans(@Param('accountId') accountId: string) {
    return this.svc.getRebalancingPlans(accountId);
  }

  // ── Tax-Loss Harvesting ───────────────────────────────────────────────────

  @Get('accounts/:accountId/tax-loss-harvest')
  @ApiOperation({
    summary: 'Get tax-loss harvesting opportunities: positions with losses > $1K or 2%, with wash-sale check and substitute suggestions',
  })
  getTLHOpportunities(@Param('accountId') accountId: string) {
    return this.svc.getTaxLossHarvestOpportunities(accountId);
  }

  // ── Performance ───────────────────────────────────────────────────────────

  @Get('accounts/:accountId/performance')
  @ApiOperation({ summary: 'Account performance summary: gains/losses, drift, expected return/volatility' })
  getPerformance(@Param('accountId') accountId: string) {
    return this.svc.getPerformanceSummary(accountId);
  }
}
