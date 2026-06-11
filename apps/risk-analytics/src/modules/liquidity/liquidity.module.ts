import { Module } from '@nestjs/common';
import { LiquidityService } from './liquidity.service';
import { LiquidityController } from './liquidity.controller';

@Module({
  providers: [LiquidityService],
  controllers: [LiquidityController],
  exports: [LiquidityService],
})
export class LiquidityModule {}
