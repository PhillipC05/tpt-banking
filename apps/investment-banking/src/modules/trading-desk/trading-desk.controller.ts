import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TradingDeskService } from './trading-desk.service';
import { AssetClass } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';

/**
 * Trading Desk controller — high-level views for equity, fixed income, and derivatives desks.
 *
 * Each desk has its own:
 *   - Real-time order book (open orders grouped by instrument)
 *   - P&L snapshot (day P&L, total unrealized, net exposure)
 *   - Position summary
 */
@ApiTags('Trading Desk')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trading-desk')
export class TradingDeskController {
  constructor(private readonly tradingDeskService: TradingDeskService) {}

  @Get('equity/dashboard')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Equity trading desk dashboard — open orders + P&L + top positions' })
  equityDashboard(@CurrentUser() user: JwtPayload) {
    return this.tradingDeskService.getDeskDashboard(AssetClass.EQUITY, user.sub);
  }

  @Get('fixed-income/dashboard')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Fixed income desk dashboard' })
  fixedIncomeDashboard(@CurrentUser() user: JwtPayload) {
    return this.tradingDeskService.getDeskDashboard(AssetClass.FIXED_INCOME, user.sub);
  }

  @Get('derivatives/dashboard')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Derivatives desk dashboard — includes Greeks summary' })
  derivativesDashboard(@CurrentUser() user: JwtPayload) {
    return this.tradingDeskService.getDeskDashboard(AssetClass.DERIVATIVE, user.sub);
  }

  @Get('firm-wide/exposure')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Firm-wide net exposure by asset class' })
  firmWideExposure() {
    return this.tradingDeskService.getFirmWideExposure();
  }

  @Get('firm-wide/pnl')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Firm-wide P&L summary (day P&L, MTD, YTD)' })
  firmWidePnl() {
    return this.tradingDeskService.getFirmWidePnl();
  }

  @Post('risk-limits/check')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Check proposed trade against risk limits before order placement' })
  checkRiskLimits(
    @Body() body: {
      instrumentId: string;
      portfolioId: string;
      side: string;
      qty: number;
      price: number;
    },
  ) {
    return this.tradingDeskService.checkRiskLimits(body);
  }
}
