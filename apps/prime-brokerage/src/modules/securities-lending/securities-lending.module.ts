import { Module } from '@nestjs/common';
import { SecuritiesLendingService } from './securities-lending.service';
import { SecuritiesLendingController } from './securities-lending.controller';

@Module({
  providers:   [SecuritiesLendingService],
  controllers: [SecuritiesLendingController],
  exports:     [SecuritiesLendingService],
})
export class SecuritiesLendingModule {}
