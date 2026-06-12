import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OpenBankingClient, OpenBankingConsent } from '@tpt/database';
import { OAuth2Service } from './oauth2.service';
import { OAuth2Controller } from './oauth2.controller';
import { OidcDiscoveryController } from './oidc-discovery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenBankingClient, OpenBankingConsent]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const privateKey = cfg.get<string>('JWT_PRIVATE_KEY');
        const publicKey  = cfg.get<string>('JWT_PUBLIC_KEY');
        if (privateKey && publicKey) {
          return {
            privateKey,
            publicKey,
            signOptions: { algorithm: 'RS256', expiresIn: '1h' },
          };
        }
        // Fallback for local dev without key env vars
        return { secret: 'dev-secret', signOptions: { expiresIn: '1h' } };
      },
    }),
  ],
  providers:   [OAuth2Service],
  controllers: [OAuth2Controller, OidcDiscoveryController],
  exports:     [OAuth2Service],
})
export class OAuth2Module {}
