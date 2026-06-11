import { Module } from '@nestjs/common';
import { IrsPricingService } from './irs-pricing.service';
import { RatesController } from './rates.controller';
import { YieldCurveModule } from '../yield-curve/yield-curve.module';

@Module({
  imports: [YieldCurveModule],
  providers: [IrsPricingService],
  controllers: [RatesController],
  exports: [IrsPricingService],
})
export class RatesModule {}
