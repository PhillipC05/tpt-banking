import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenBankingConsent, Account, LedgerEntry } from '@tpt/database';
import { ObieService } from './obie.service';
import { ObieController } from './obie.controller';
import { OAuth2Module } from '../oauth2/oauth2.module';

@Module({
  imports: [TypeOrmModule.forFeature([OpenBankingConsent, Account, LedgerEntry]), OAuth2Module],
  providers: [ObieService],
  controllers: [ObieController],
})
export class ObieModule {}
