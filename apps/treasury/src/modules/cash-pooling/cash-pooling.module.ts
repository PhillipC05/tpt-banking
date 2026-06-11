import { Module } from '@nestjs/common';
import { CashPoolingService } from './cash-pooling.service';
import { CashPoolingController } from './cash-pooling.controller';

@Module({
  providers: [CashPoolingService],
  controllers: [CashPoolingController],
  exports: [CashPoolingService],
})
export class CashPoolingModule {}
