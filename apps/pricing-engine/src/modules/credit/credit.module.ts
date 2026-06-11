import { Module } from '@nestjs/common';
import { CdsPricingService } from './cds-pricing.service';
import { CreditController } from './credit.controller';
import { YieldCurveModule } from '../yield-curve/yield-curve.module';

@Module({
  imports: [YieldCurveModule],
  providers: [CdsPricingService],
  controllers: [CreditController],
  exports: [CdsPricingService],
})
export class CreditModule {}
