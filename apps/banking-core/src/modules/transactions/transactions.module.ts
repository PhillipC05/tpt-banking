import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransferSaga } from './saga/transfer.saga';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    LedgerModule,
    AccountsModule,
  ],
  providers: [TransactionsService, TransferSaga],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
