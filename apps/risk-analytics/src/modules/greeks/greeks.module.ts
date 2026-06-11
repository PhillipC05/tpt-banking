import { Module } from '@nestjs/common';
import { PortfolioGreeksService } from './portfolio-greeks.service';
import { GreeksController } from './greeks.controller';

@Module({
  providers: [PortfolioGreeksService],
  controllers: [GreeksController],
  exports: [PortfolioGreeksService],
})
export class GreeksModule {}
