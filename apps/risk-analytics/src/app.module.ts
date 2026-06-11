import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { VarModule } from './modules/var/var.module';
import { StressTestingModule } from './modules/stress-testing/stress-testing.module';
import { GreeksModule } from './modules/greeks/greeks.module';
import { CreditRiskModule } from './modules/credit-risk/credit-risk.module';
import { CvaModule } from './modules/cva/cva.module';
import { LiquidityModule } from './modules/liquidity/liquidity.module';

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
    VarModule,
    StressTestingModule,
    GreeksModule,
    CreditRiskModule,
    CvaModule,
    LiquidityModule,
  ],
})
export class AppModule {}
