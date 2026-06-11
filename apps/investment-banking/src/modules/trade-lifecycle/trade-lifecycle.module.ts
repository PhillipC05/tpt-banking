import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, Execution } from '@tpt/database';
import { TradeLifecycleService } from './trade-lifecycle.service';
import { TradeLifecycleController } from './trade-lifecycle.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Execution])],
  providers: [TradeLifecycleService],
  controllers: [TradeLifecycleController],
  exports: [TradeLifecycleService],
})
export class TradeLifecycleModule {}
