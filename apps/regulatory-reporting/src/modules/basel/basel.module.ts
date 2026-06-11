import { Module } from '@nestjs/common';
import { BaselService } from './basel.service';
import { BaselController } from './basel.controller';

@Module({
  providers: [BaselService],
  controllers: [BaselController],
  exports: [BaselService],
})
export class BaselModule {}
