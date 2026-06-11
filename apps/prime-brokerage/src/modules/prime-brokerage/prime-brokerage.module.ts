import { Module } from '@nestjs/common';
import { PrimeBrokerageService } from './prime-brokerage.service';
import { PrimeBrokerageController } from './prime-brokerage.controller';

@Module({
  providers:   [PrimeBrokerageService],
  controllers: [PrimeBrokerageController],
  exports:     [PrimeBrokerageService],
})
export class PrimeBrokerageModule {}
