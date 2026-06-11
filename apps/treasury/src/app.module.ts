import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { FxDeskModule } from './modules/fx-desk/fx-desk.module';
import { LiquidityForecastModule } from './modules/liquidity-forecast/liquidity-forecast.module';
import { CashPoolingModule } from './modules/cash-pooling/cash-pooling.module';
import { InterestRateRiskModule } from './modules/interest-rate-risk/interest-rate-risk.module';
import { NostroModule } from './modules/nostro/nostro.module';
import { CorrespondentModule } from './modules/correspondent/correspondent.module';

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
    FxDeskModule,
    LiquidityForecastModule,
    CashPoolingModule,
    InterestRateRiskModule,
    NostroModule,
    CorrespondentModule,
  ],
})
export class AppModule {}
