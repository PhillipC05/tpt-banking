import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { BaselModule } from './modules/basel/basel.module';
import { CcarDfastModule } from './modules/ccar-dfast/ccar-dfast.module';
import { FinraModule } from './modules/finra/finra.module';
import { SecModule } from './modules/sec/sec.module';
import { FincenModule } from './modules/fincen/fincen.module';
import { ReportSchedulerModule } from './modules/scheduler/scheduler.module';

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
    ScheduleModule.forRoot(),
    BaselModule,
    CcarDfastModule,
    FinraModule,
    SecModule,
    FincenModule,
    ReportSchedulerModule,
  ],
})
export class AppModule {}
