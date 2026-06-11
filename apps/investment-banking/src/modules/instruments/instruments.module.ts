import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from '@tpt/database';
import { InstrumentsService } from './instruments.service';
import { InstrumentsController } from './instruments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument])],
  providers: [InstrumentsService],
  controllers: [InstrumentsController],
  exports: [InstrumentsService],
})
export class InstrumentsModule {}
