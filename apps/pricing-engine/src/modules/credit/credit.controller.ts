import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CdsPricingService } from './cds-pricing.service';
import { YieldCurveService } from '../yield-curve/yield-curve.service';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';

@ApiTags('Pricing — Credit (CDS)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing/credit')
export class CreditController {
  constructor(
    private readonly cdsService: CdsPricingService,
    private readonly yieldCurveService: YieldCurveService,
  ) {}

  @Post('cds')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Price a Credit Default Swap (CDS) — ISDA standard model',
    description:
      'Computes NPV, par spread, credit DV01, upfront payment, implied hazard rate, ' +
      'and premium cash flow schedule. Uses constant hazard rate derived from market spread.',
  })
  priceCds(
    @Body() body: {
      notional: number;
      spread: number;
      maturityYears: number;
      recoveryRate?: number;
      frequency?: number;
      riskFreeRate?: number;
    },
  ) {
    const discountCurve = this.yieldCurveService.buildFlat(body.riskFreeRate ?? 0.05);

    return this.cdsService.price({
      notional: body.notional,
      spread: body.spread,
      maturityYears: body.maturityYears,
      recoveryRate: body.recoveryRate ?? 0.40,
      frequency: body.frequency ?? 4,
      discountCurve,
    });
  }

  @Post('cds/spread-to-upfront')
  @Roles(Role.TRADER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Convert running spread to ISDA upfront payment (100bps / 500bps standard coupons)',
  })
  spreadToUpfront(
    @Body() body: {
      notional: number;
      marketSpread: number;
      maturityYears: number;
      recoveryRate?: number;
      riskFreeRate?: number;
    },
  ) {
    const discountCurve = this.yieldCurveService.buildFlat(body.riskFreeRate ?? 0.05);
    const result = this.cdsService.price({
      notional: body.notional,
      spread: body.marketSpread,
      maturityYears: body.maturityYears,
      recoveryRate: body.recoveryRate ?? 0.40,
      frequency: 4,
      discountCurve,
    });
    return {
      upfront: result.upfront,
      upfrontPct: ((result.upfront / body.notional) * 100).toFixed(4),
      parSpread: result.parSpread,
      parSpreadBps: (result.parSpread * 10000).toFixed(2),
    };
  }
}
