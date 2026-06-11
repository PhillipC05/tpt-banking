import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ExecutionsModule } from './modules/executions/executions.module';
import { PositionsModule } from './modules/positions/positions.module';
import { TradingDeskModule } from './modules/trading-desk/trading-desk.module';
import { TradeLifecycleModule } from './modules/trade-lifecycle/trade-lifecycle.module';

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
    InstrumentsModule,
    PortfoliosModule,
    OrdersModule,
    ExecutionsModule,
    PositionsModule,
    TradingDeskModule,
    TradeLifecycleModule,
  ],
})
export class AppModule {}
