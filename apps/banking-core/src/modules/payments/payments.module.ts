import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AchPayment, WireTransfer, RtpPayment, SepaPayment } from '@tpt/database';
import { AchService } from './ach/ach.service';
import { AchController } from './ach/ach.controller';
import { WireService } from './wire/wire.service';
import { WireController } from './wire/wire.controller';
import { PlaidService } from './plaid/plaid.service';
import { RtpService } from './rtp/rtp.service';
import { RtpController } from './rtp/rtp.controller';
import { SepaService } from './sepa/sepa.service';
import { SepaController } from './sepa/sepa.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AchPayment, WireTransfer, RtpPayment, SepaPayment]),
    LedgerModule,
    AccountsModule,
    AuthModule,
  ],
  providers: [AchService, WireService, PlaidService, RtpService, SepaService],
  controllers: [AchController, WireController, RtpController, SepaController],
  exports: [AchService, WireService, RtpService, SepaService],
})
export class PaymentsModule {}
