import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { OpenBankingConsent, Account, LedgerEntry } from '@tpt/database';
import { ObieService } from './obie.service';
import { ObieController } from './obie.controller';
import { OAuth2Module } from '../oauth2/oauth2.module';
import { PaymentBridgeService } from './payment-bridge.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenBankingConsent, Account, LedgerEntry]),
    HttpModule.register({ timeout: 15_000 }),
    OAuth2Module,
    WebhooksModule,
  ],
  providers:   [ObieService, PaymentBridgeService],
  controllers: [ObieController],
  exports:     [PaymentBridgeService],
})
export class ObieModule {}
