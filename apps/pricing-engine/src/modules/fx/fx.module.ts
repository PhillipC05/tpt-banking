import { Module } from '@nestjs/common';
import { FxPricingService } from './fx-pricing.service';
import { FxController } from './fx.controller';

@Module({
  providers: [FxPricingService],
  controllers: [FxController],
  exports: [FxPricingService],
})
export class FxModule {}
