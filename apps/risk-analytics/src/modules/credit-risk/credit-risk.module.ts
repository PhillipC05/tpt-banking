import { Module } from '@nestjs/common';
import { CreditRiskService } from './credit-risk.service';
import { CreditRiskController } from './credit-risk.controller';

@Module({
  providers: [CreditRiskService],
  controllers: [CreditRiskController],
  exports: [CreditRiskService],
})
export class CreditRiskModule {}
