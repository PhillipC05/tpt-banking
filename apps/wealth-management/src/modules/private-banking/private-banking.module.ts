import { Module } from '@nestjs/common';
import { PrivateBankingService } from './private-banking.service';
import { PrivateBankingController } from './private-banking.controller';

@Module({
  providers:   [PrivateBankingService],
  controllers: [PrivateBankingController],
  exports:     [PrivateBankingService],
})
export class PrivateBankingModule {}
