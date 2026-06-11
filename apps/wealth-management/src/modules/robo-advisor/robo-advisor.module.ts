import { Module } from '@nestjs/common';
import { RoboAdvisorService } from './robo-advisor.service';
import { RoboAdvisorController } from './robo-advisor.controller';

@Module({
  providers:   [RoboAdvisorService],
  controllers: [RoboAdvisorController],
  exports:     [RoboAdvisorService],
})
export class RoboAdvisorModule {}
