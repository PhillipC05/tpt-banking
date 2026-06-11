import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScreeningResult } from '@tpt/database';
import { ScreeningService } from './screening.service';
import { ScreeningController } from './screening.controller';
import { ComplyAdvantageService } from './comply-advantage.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScreeningResult]), HttpModule],
  providers: [ScreeningService, ComplyAdvantageService],
  controllers: [ScreeningController],
  exports: [ScreeningService, ComplyAdvantageService],
})
export class ScreeningModule {}
