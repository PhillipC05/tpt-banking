import { Module } from '@nestjs/common';
import { SecService } from './sec.service';
import { SecController } from './sec.controller';

@Module({
  providers: [SecService],
  controllers: [SecController],
  exports: [SecService],
})
export class SecModule {}
