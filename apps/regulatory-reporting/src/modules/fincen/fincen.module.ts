import { Module } from '@nestjs/common';
import { FincenService } from './fincen.service';
import { FincenController } from './fincen.controller';

@Module({
  providers: [FincenService],
  controllers: [FincenController],
  exports: [FincenService],
})
export class FincenModule {}
