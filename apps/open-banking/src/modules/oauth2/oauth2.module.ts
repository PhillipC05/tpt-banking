import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { OpenBankingClient, OpenBankingConsent } from '@tpt/database';
import { OAuth2Service } from './oauth2.service';
import { OAuth2Controller } from './oauth2.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenBankingClient, OpenBankingConsent]),
    JwtModule.register({}),
  ],
  providers: [OAuth2Service],
  controllers: [OAuth2Controller],
  exports: [OAuth2Service],
})
export class OAuth2Module {}
