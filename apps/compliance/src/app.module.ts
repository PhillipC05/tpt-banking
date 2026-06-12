import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { KycModule } from './modules/kyc/kyc.module';
import { ScreeningModule } from './modules/screening/screening.module';
import { AmlModule } from './modules/aml/aml.module';
import { CasesModule } from './modules/cases/cases.module';
import { SarModule } from './modules/sar/sar.module';
import { CtrModule } from './modules/ctr/ctr.module';
// Phase 3b
import { CddModule } from './modules/cdd/cdd.module';
import { EddModule } from './modules/edd/edd.module';

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
    KycModule,
    ScreeningModule,
    AmlModule,
    CasesModule,
    SarModule,
    CtrModule,
    // Phase 3b
    CddModule,
    EddModule,
  ],
})
export class AppModule {}
