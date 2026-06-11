import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenBankingConsent, Account, LedgerEntry } from '@tpt/database';
import { Psd2Service } from './psd2.service';
import { Psd2Controller } from './psd2.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OpenBankingConsent, Account, LedgerEntry])],
  providers: [Psd2Service],
  controllers: [Psd2Controller],
})
export class Psd2Module {}
