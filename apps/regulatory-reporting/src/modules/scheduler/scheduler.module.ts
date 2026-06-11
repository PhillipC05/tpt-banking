import { Module } from '@nestjs/common';
import { ReportSchedulerService } from './scheduler.service';
import { ReportSchedulerController } from './scheduler.controller';

@Module({
  providers: [ReportSchedulerService],
  controllers: [ReportSchedulerController],
  exports: [ReportSchedulerService],
})
export class ReportSchedulerModule {}
