import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { CollateralManagementModule } from './modules/collateral-management/collateral-management.module';
import { MarginCallModule } from './modules/margin-call/margin-call.module';
import { SecuritiesLendingModule } from './modules/securities-lending/securities-lending.module';
import { PrimeBrokerageModule } from './modules/prime-brokerage/prime-brokerage.module';

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
    CollateralManagementModule,
    MarginCallModule,
    SecuritiesLendingModule,
    PrimeBrokerageModule,
  ],
})
export class AppModule {}
