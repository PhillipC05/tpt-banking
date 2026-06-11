import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Market Data')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('quote/:symbol')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get latest market quote for a symbol' })
  getQuote(@Param('symbol') symbol: string) {
    return this.marketDataService.getQuote(symbol);
  }

  @Post('quotes')
  @Roles(Role.TRADER, Role.RELATIONSHIP_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get market quotes for multiple symbols at once' })
  getQuotes(@Body() body: { symbols: string[] }) {
    return this.marketDataService.getQuotes(body.symbols);
  }

  @Post('quote')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Publish/update a market quote (market data feed ingestion)' })
  publishQuote(@Body() quote: Omit<import('./market-data.service').MarketQuote, 'timestamp'>) {
    return this.marketDataService.updateQuote(quote);
  }
}
