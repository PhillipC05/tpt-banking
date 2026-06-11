import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Position, Instrument } from '@tpt/database';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Position, Instrument])],
  providers: [PositionsService],
  controllers: [PositionsController],
  exports: [PositionsService],
})
export class PositionsModule {}
