import { Module } from '@nestjs/common';
import { InterestRateRiskService } from './interest-rate-risk.service';
import { InterestRateRiskController } from './interest-rate-risk.controller';

@Module({
  providers: [InterestRateRiskService],
  controllers: [InterestRateRiskController],
  exports: [InterestRateRiskService],
})
export class InterestRateRiskModule {}
