import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenBankingConsent, Account, LedgerEntry } from '@tpt/database';
import { FdxService } from './fdx.service';
import { FdxController } from './fdx.controller';
import { OAuth2Module } from '../oauth2/oauth2.module';
import { ObieModule } from '../obie/obie.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenBankingConsent, Account, LedgerEntry]),
    OAuth2Module,
    ObieModule,
  ],
  providers: [FdxService],
  controllers: [FdxController],
})
export class FdxModule {}
