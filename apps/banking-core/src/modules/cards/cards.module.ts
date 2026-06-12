import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card, CardTransaction, CardDispute } from '@tpt/database';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { CardsWebhookController } from './cards-webhook.controller';
import { StripeIssuingService } from './stripe-issuing.service';
import { DisputesService } from './disputes/disputes.service';
import { DisputesController } from './disputes/disputes.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Card, CardTransaction, CardDispute]),
    LedgerModule,
    AccountsModule,
    CustomersModule,
  ],
  providers:   [CardsService, StripeIssuingService, DisputesService],
  controllers: [CardsController, CardsWebhookController, DisputesController],
  exports: [CardsService],
})
export class CardsModule {}
