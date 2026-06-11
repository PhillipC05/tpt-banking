import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KycVerification } from '@tpt/database';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { JumioService } from './providers/jumio.service';
import { OnfidoService } from './providers/onfido.service';

@Module({
  imports: [TypeOrmModule.forFeature([KycVerification]), HttpModule],
  providers: [KycService, JumioService, OnfidoService],
  controllers: [KycController],
  exports: [KycService],
})
export class KycModule {}
