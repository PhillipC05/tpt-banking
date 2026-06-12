import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenBankingConsent } from '@tpt/database';
import { ConsentService } from './consent.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [TypeOrmModule.forFeature([OpenBankingConsent]), WebhooksModule],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
