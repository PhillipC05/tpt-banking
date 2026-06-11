import { Module } from '@nestjs/common';
import { MarketDataService } from './market-data.service';
import { MarketDataController } from './market-data.controller';

@Module({
  providers: [MarketDataService],
  controllers: [MarketDataController],
  exports: [MarketDataService],
})
export class MarketDataModule {}
