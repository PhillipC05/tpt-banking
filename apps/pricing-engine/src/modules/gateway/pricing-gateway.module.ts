import { Module } from '@nestjs/common';
import { PricingGateway } from './pricing.gateway';
import { MarketDataModule } from '../market-data/market-data.module';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [MarketDataModule, FxModule],
  providers: [PricingGateway],
  exports: [PricingGateway],
})
export class PricingGatewayModule {}
