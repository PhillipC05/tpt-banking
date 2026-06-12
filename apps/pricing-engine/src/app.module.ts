import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { OptionsModule } from './modules/options/options.module';
import { YieldCurveModule } from './modules/yield-curve/yield-curve.module';
import { RatesModule } from './modules/rates/rates.module';
import { CreditModule } from './modules/credit/credit.module';
import { FxModule } from './modules/fx/fx.module';
import { PricingGatewayModule } from './modules/gateway/pricing-gateway.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...AppDataSource.options, autoLoadEntities: true }),
    }),
    RedisModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({
        type: 'single' as const,
        options: {
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    MarketDataModule,
    OptionsModule,
    YieldCurveModule,
    RatesModule,
    CreditModule,
    FxModule,
    PricingGatewayModule,
    HealthModule,
  ],
})
export class AppModule {}
