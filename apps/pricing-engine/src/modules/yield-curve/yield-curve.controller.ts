import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { YieldCurveService } from './yield-curve.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Pricing — Yield Curve')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing/yield-curve')
export class YieldCurveController {
  constructor(private readonly yieldCurveService: YieldCurveService) {}

  @Post('bootstrap')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bootstrap zero curve from par swap rates',
    description:
      'Accepts an array of par swap rates (tenor + rate + frequency) and returns the ' +
      'bootstrapped zero curve with discount factors.',
  })
  bootstrap(
    @Body() body: {
      swapRates: Array<{ tenor: number; rate: number; frequency: number }>;
      currency?: string;
      name?: string;
    },
  ) {
    const curve = this.yieldCurveService.bootstrapFromSwapRates(
      body.swapRates,
      body.currency,
      body.name,
    );
    return {
      curve,
      spotRates: this.yieldCurveService.getSpotRates(curve),
    };
  }

  @Post('flat')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Build a flat yield curve at a given rate' })
  flat(@Body() body: { rate: number; currency?: string }) {
    const curve = this.yieldCurveService.buildFlat(body.rate, body.currency);
    return {
      curve,
      spotRates: this.yieldCurveService.getSpotRates(curve),
    };
  }

  @Post('zero-rate')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Interpolate zero rate and discount factor at a specific tenor' })
  getZeroRate(
    @Body() body: {
      curve: ReturnType<YieldCurveService['buildFlat']>;
      tenor: number;
    },
  ) {
    const zeroRate = this.yieldCurveService.getZeroRate(body.curve, body.tenor);
    const df = this.yieldCurveService.getDiscountFactor(body.curve, body.tenor);
    return { tenor: body.tenor, zeroRate, discountFactor: df };
  }

  @Post('forward-rate')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Compute implied forward rate between two tenors' })
  getForwardRate(
    @Body() body: {
      curve: ReturnType<YieldCurveService['buildFlat']>;
      startTenor: number;
      endTenor: number;
    },
  ) {
    return this.yieldCurveService.getForwardRate(body.curve, body.startTenor, body.endTenor);
  }

  @Post('par-rate')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Compute par swap rate at a given tenor from the zero curve' })
  getParRate(
    @Body() body: {
      curve: ReturnType<YieldCurveService['buildFlat']>;
      tenor: number;
      frequency?: number;
    },
  ) {
    const parRate = this.yieldCurveService.getParRate(body.curve, body.tenor, body.frequency ?? 2);
    return { tenor: body.tenor, parRate, parRatePct: (parRate * 100).toFixed(4) };
  }
}
