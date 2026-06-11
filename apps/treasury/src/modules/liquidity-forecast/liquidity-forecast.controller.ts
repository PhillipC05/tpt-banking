import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LiquidityForecastService, CashFlowEntry } from './liquidity-forecast.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Liquidity Forecasting')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('liquidity')
export class LiquidityForecastController {
  constructor(private readonly liquidityForecastService: LiquidityForecastService) {}

  @Post('project')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Project daily cash flow positions over a horizon (up to 365 days)' })
  projectCashFlows(
    @Body() body: {
      openingBalance: number;
      cashFlows: CashFlowEntry[];
      horizonDays: number;
    },
  ) {
    return this.liquidityForecastService.projectCashFlows(
      body.openingBalance,
      body.cashFlows,
      Math.min(body.horizonDays, 365),
    );
  }

  @Post('survival-days')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Compute survival days under base / stress / severe-stress scenarios' })
  computeSurvivalDays(
    @Body() body: {
      openingBalance: number;
      liquidityBuffer: number;
      cashFlows: CashFlowEntry[];
      scenario: 'BASE' | 'STRESS' | 'SEVERE_STRESS';
      horizonDays?: number;
    },
  ) {
    return this.liquidityForecastService.computeSurvivalDays(
      body.openingBalance,
      body.liquidityBuffer,
      body.cashFlows,
      body.scenario,
      body.horizonDays ?? 90,
    );
  }

  @Post('gap-analysis')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Repricing / maturity gap analysis across standard time buckets' })
  computeGapAnalysis(
    @Body() body: {
      items: Array<{
        type: 'ASSET' | 'LIABILITY';
        amount: number;
        repriceDate?: string;
        maturityDate?: string;
      }>;
    },
  ) {
    return this.liquidityForecastService.computeGapAnalysis(body.items);
  }

  @Post('intraday')
  @Roles(Role.RISK_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Compute intraday liquidity position from payment queue' })
  computeIntradayPosition(
    @Body() body: {
      openingBalance: number;
      payments: Array<{ time: string; amount: number; description: string }>;
    },
  ) {
    return this.liquidityForecastService.computeIntradayPosition(
      body.openingBalance,
      body.payments,
    );
  }
}
