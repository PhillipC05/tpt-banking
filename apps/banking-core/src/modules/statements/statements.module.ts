import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account, LedgerEntry } from '@tpt/database';
import { StatementsService } from './statements.service';
import { StatementsController } from './statements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Account, LedgerEntry])],
  providers: [StatementsService],
  controllers: [StatementsController],
  exports: [StatementsService],
})
export class StatementsModule {}
