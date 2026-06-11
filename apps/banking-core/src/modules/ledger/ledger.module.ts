import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journal, LedgerEntry } from '@tpt/database';
import { JournalService } from './journal.service';
import { LedgerController } from './ledger.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Journal, LedgerEntry])],
  providers: [JournalService],
  controllers: [LedgerController],
  exports: [JournalService],
})
export class LedgerModule {}
