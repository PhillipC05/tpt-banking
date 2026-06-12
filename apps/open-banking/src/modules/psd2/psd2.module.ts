import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenBankingConsent, Account, LedgerEntry } from '@tpt/database';
import { Psd2Service } from './psd2.service';
import { Psd2Controller } from './psd2.controller';
import { ObieModule } from '../obie/obie.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenBankingConsent, Account, LedgerEntry]),
    ObieModule,
    WebhooksModule,
  ],
  providers:   [Psd2Service],
  controllers: [Psd2Controller],
})
export class Psd2Module {}
