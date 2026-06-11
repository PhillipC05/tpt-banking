import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { HealthModule } from './modules/health/health.module';
// Phase 2
import { LoansModule } from './modules/loans/loans.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CardsModule } from './modules/cards/cards.module';
import { StatementsModule } from './modules/statements/statements.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    // Configuration — loads .env files
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...AppDataSource.options,
        autoLoadEntities: true,
      }),
    }),

    // Redis
    RedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'single',
        options: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: false,
          reconnectOnError: () => true,
        },
      }),
      inject: [ConfigService],
    }),

    // Rate limiting — 100 requests per 15 minutes per IP
    ThrottlerModule.forRoot([
      {
        ttl: 900_000,
        limit: 100,
      },
    ]),

    // Feature modules — Phase 1
    AuthModule,
    UsersModule,
    CustomersModule,
    AccountsModule,
    LedgerModule,
    TransactionsModule,
    HealthModule,
    // Feature modules — Phase 2
    LoansModule,
    PaymentsModule,
    CardsModule,
    StatementsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
