import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan, LoanPayment } from '@tpt/database';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, LoanPayment]),
    LedgerModule,
    AccountsModule,
  ],
  providers: [LoansService],
  controllers: [LoansController],
  exports: [LoansService],
})
export class LoansModule {}
