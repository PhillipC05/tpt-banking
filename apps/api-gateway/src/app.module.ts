import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisModule } from '@nestjs-modules/ioredis';
import { HealthModule } from './modules/health/health.module';
import { ProxyModule } from './modules/proxy/proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),

    RedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'single',
        options: {
          host:     config.get<string>('REDIS_HOST', 'localhost'),
          port:     config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),

    // Named throttler tiers — applied per-route with @Throttle(ThrottleTiers.X)
    // The 'default' tier acts as the gateway-wide catch-all.
    ThrottlerModule.forRoot([
      { name: 'default',   ttl: 60_000,  limit: 120 }, // standard: 120 req/min
      { name: 'auth',      ttl: 60_000,  limit: 5   }, // auth endpoints: 5 req/min
      { name: 'highFreq',  ttl: 60_000,  limit: 600 }, // pricing/market data: 600 req/min
      { name: 'admin',     ttl: 60_000,  limit: 30  }, // admin/compliance: 30 req/min
      { name: 'public',    ttl: 60_000,  limit: 20  }, // unauthenticated: 20 req/min
    ]),

    HealthModule,
    ProxyModule,
  ],
  providers: [
    // ThrottlerGuard enforces all configured tiers globally at the gateway
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
