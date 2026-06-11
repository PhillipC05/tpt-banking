import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card, CardTransaction } from '@tpt/database';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { StripeIssuingService } from './stripe-issuing.service';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Card, CardTransaction]),
    LedgerModule,
    AccountsModule,
    CustomersModule,
  ],
  providers: [CardsService, StripeIssuingService],
  controllers: [CardsController],
  exports: [CardsService],
})
export class CardsModule {}
