import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Execution, Order } from '@tpt/database';
import { ExecutionsService } from './executions.service';
import { ExecutionsController } from './executions.controller';
import { OrdersModule } from '../orders/orders.module';
import { PositionsModule } from '../positions/positions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Execution, Order]), OrdersModule, PositionsModule],
  providers: [ExecutionsService],
  controllers: [ExecutionsController],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
