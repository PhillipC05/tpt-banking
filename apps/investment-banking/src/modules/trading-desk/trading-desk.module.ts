import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Position, Instrument, Portfolio } from '@tpt/database';
import { TradingDeskService } from './trading-desk.service';
import { TradingDeskController } from './trading-desk.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Position, Instrument, Portfolio])],
  providers: [TradingDeskService],
  controllers: [TradingDeskController],
  exports: [TradingDeskService],
})
export class TradingDeskModule {}
