import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FxPricingService } from './fx-pricing.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Pricing — FX')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing/fx')
export class FxController {
  constructor(private readonly fxService: FxPricingService) {}

  @Get('pairs')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all supported FX pairs' })
  getSupportedPairs() {
    return { pairs: this.fxService.getSupportedPairs() };
  }

  @Get('spot/:pair')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get spot quote for a currency pair' })
  getSpot(@Param('pair') pair: string) {
    return this.fxService.getSpot(pair);
  }

  @Get('forward/:pair/:tenorYears')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Price FX forward outright (CIP) at a specific tenor' })
  priceForward(
    @Param('pair') pair: string,
    @Param('tenorYears') tenorYears: number,
  ) {
    return this.fxService.priceForward(pair, +tenorYears);
  }

  @Get('forward-curve/:pair')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get full forward curve (1W through 2Y) for a pair' })
  getForwardCurve(@Param('pair') pair: string) {
    return this.fxService.priceForwardCurve(pair);
  }

  @Post('swap')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Price an FX swap (near + far leg)' })
  priceFxSwap(
    @Body() body: { pair: string; nearTenor: number; farTenor: number },
  ) {
    return this.fxService.priceFxSwap(body.pair, body.nearTenor, body.farTenor);
  }

  @Post('option')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Price FX vanilla option — Garman-Kohlhagen model',
    description:
      'Prices European call or put on an FX pair. Uses built-in risk-free rates per currency. ' +
      'Returns price as pips and as % of notional, plus Delta, Vega, Gamma.',
  })
  priceOption(
    @Body() body: {
      pair: string;
      strike: number;
      tenorYears: number;
      volatility: number;
      optionType: 'call' | 'put';
      notional: number;
    },
  ) {
    return this.fxService.priceOption(body);
  }
}
