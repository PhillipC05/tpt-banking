import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FxDeskService, DealSide, TenorLabel } from './fx-desk.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('FX Dealing Desk')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fx-desk')
export class FxDeskController {
  constructor(private readonly fxDeskService: FxDeskService) {}

  // ── Market data ──────────────────────────────────────────────────────────────

  @Get('rates/spot')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all live spot rates (bid/mid/ask)' })
  getAllSpotRates() {
    return this.fxDeskService.getAllSpotRates();
  }

  @Get('rates/spot/:currencyPair')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get spot rate for a currency pair (e.g. EUR/USD)' })
  @ApiParam({ name: 'currencyPair', example: 'EURUSD' })
  getSpotRate(@Param('currencyPair') raw: string) {
    const pair = raw.length === 6 ? `${raw.slice(0, 3)}/${raw.slice(3)}` : raw;
    return this.fxDeskService.getSpotRate(pair.toUpperCase());
  }

  @Get('rates/forward/:currencyPair')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all forward tenors + rates for a currency pair' })
  @ApiQuery({ name: 'tenor', required: false, example: '3M', description: 'If provided, returns only that tenor' })
  getForwardRates(
    @Param('currencyPair') raw: string,
    @Query('tenor') tenor?: string,
  ) {
    const pair = raw.length === 6 ? `${raw.slice(0, 3)}/${raw.slice(3)}` : raw;
    if (tenor) {
      return this.fxDeskService.getForwardRate(pair.toUpperCase(), tenor as TenorLabel);
    }
    return this.fxDeskService.getForwardPoints(pair.toUpperCase());
  }

  // ── Deal booking ─────────────────────────────────────────────────────────────

  @Post('deals/spot')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Book an FX spot deal (T+2 settlement)' })
  bookSpotDeal(
    @Body() body: {
      currencyPair: string;
      side: DealSide;
      baseCurrencyAmount: number;
      counterpartyId: string;
      traderId: string;
      portfolioId: string;
    },
  ) {
    return this.fxDeskService.bookSpotDeal(body);
  }

  @Post('deals/forward')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Book an FX forward deal at a specified tenor' })
  bookForwardDeal(
    @Body() body: {
      currencyPair: string;
      side: DealSide;
      baseCurrencyAmount: number;
      tenor: TenorLabel;
      counterpartyId: string;
      traderId: string;
      portfolioId: string;
    },
  ) {
    return this.fxDeskService.bookForwardDeal(body);
  }

  @Get('deals/:dealId')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get deal details by ID' })
  getDeal(@Param('dealId') dealId: string) {
    return this.fxDeskService.getDeal(dealId);
  }

  @Post('deals/:dealId/cancel')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel a confirmed deal' })
  cancelDeal(@Param('dealId') dealId: string) {
    return this.fxDeskService.cancelDeal(dealId);
  }

  @Post('deals/:dealId/settle')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Settle a confirmed deal and realize P&L' })
  settleDeal(@Param('dealId') dealId: string) {
    return this.fxDeskService.settleDeal(dealId);
  }

  @Post('deals/:dealId/mtm')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark-to-market a deal against current spot' })
  markToMarket(@Param('dealId') dealId: string) {
    return this.fxDeskService.markToMarket(dealId);
  }

  // ── Deal book & summary ──────────────────────────────────────────────────────

  @Get('book')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'FX deal book — open positions by currency pair' })
  @ApiQuery({ name: 'currencyPair', required: false, example: 'EURUSD' })
  getDealBook(@Query('currencyPair') raw?: string) {
    const pair = raw
      ? (raw.length === 6 ? `${raw.slice(0, 3)}/${raw.slice(3)}` : raw).toUpperCase()
      : undefined;
    return this.fxDeskService.getDealBook(pair);
  }

  @Get('desk/summary')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'FX desk summary — P&L, deal counts, net exposure by currency' })
  getDeskSummary() {
    return this.fxDeskService.getDeskSummary();
  }
}
