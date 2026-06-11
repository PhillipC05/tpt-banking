import { Module } from '@nestjs/common';
import { StressTestingService } from './stress-testing.service';
import { StressTestingController } from './stress-testing.controller';

@Module({
  providers: [StressTestingService],
  controllers: [StressTestingController],
  exports: [StressTestingService],
})
export class StressTestingModule {}
