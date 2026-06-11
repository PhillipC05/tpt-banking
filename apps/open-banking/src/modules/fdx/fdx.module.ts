import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenBankingConsent, Account, LedgerEntry } from '@tpt/database';
import { FdxService } from './fdx.service';
import { FdxController } from './fdx.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OpenBankingConsent, Account, LedgerEntry])],
  providers: [FdxService],
  controllers: [FdxController],
})
export class FdxModule {}
