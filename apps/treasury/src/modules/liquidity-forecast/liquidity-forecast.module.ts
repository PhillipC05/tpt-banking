import { Module } from '@nestjs/common';
import { LiquidityForecastService } from './liquidity-forecast.service';
import { LiquidityForecastController } from './liquidity-forecast.controller';

@Module({
  providers: [LiquidityForecastService],
  controllers: [LiquidityForecastController],
  exports: [LiquidityForecastService],
})
export class LiquidityForecastModule {}
