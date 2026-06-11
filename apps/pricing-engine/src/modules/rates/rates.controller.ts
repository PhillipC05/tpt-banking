import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IrsPricingService } from './irs-pricing.service';
import { YieldCurveService } from '../yield-curve/yield-curve.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Pricing — Interest Rates (IRS)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing/rates')
export class RatesController {
  constructor(
    private readonly irsService: IrsPricingService,
    private readonly yieldCurveService: YieldCurveService,
  ) {}

  @Post('irs')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Price an Interest Rate Swap (IRS) — multi-curve framework',
    description:
      'Computes NPV, PV01, DV01, fair swap rate, and full cash flow schedules for both legs. ' +
      'Accepts separate discount (OIS) and forward curves.',
  })
  priceIrs(
    @Body() body: {
      notional: number;
      fixedRate: number;
      maturityYears: number;
      fixedFrequency?: number;
      floatFrequency?: number;
      position: 'PAYER' | 'RECEIVER';
      riskFreeRate?: number;
    },
  ) {
    const rate = body.riskFreeRate ?? 0.05;
    const discountCurve = this.yieldCurveService.buildFlat(rate);
    const forwardCurve = this.yieldCurveService.buildFlat(rate + 0.001); // Small spread

    return this.irsService.price({
      notional: body.notional,
      fixedRate: body.fixedRate,
      maturityYears: body.maturityYears,
      fixedFrequency: body.fixedFrequency ?? 2,
      floatFrequency: body.floatFrequency ?? 2,
      position: body.position,
      discountCurve,
      forwardCurve,
    });
  }

  @Post('irs/with-curves')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Price IRS with explicit bootstrapped discount and forward curves' })
  priceIrsWithCurves(@Body() body: Parameters<IrsPricingService['price']>[0]) {
    return this.irsService.price(body);
  }
}
