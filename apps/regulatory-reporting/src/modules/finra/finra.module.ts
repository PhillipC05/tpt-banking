import { Module } from '@nestjs/common';
import { FinraService } from './finra.service';
import { FinraController } from './finra.controller';

@Module({
  providers: [FinraService],
  controllers: [FinraController],
  exports: [FinraService],
})
export class FinraModule {}
