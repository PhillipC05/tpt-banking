import { Module } from '@nestjs/common';
import { MarginCallService } from './margin-call.service';
import { MarginCallController } from './margin-call.controller';

@Module({
  providers:   [MarginCallService],
  controllers: [MarginCallController],
  exports:     [MarginCallService],
})
export class MarginCallModule {}
