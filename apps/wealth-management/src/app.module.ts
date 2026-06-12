import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { PrivateBankingModule } from './modules/private-banking/private-banking.module';
import { FamilyOfficeModule } from './modules/family-office/family-office.module';
import { RoboAdvisorModule } from './modules/robo-advisor/robo-advisor.module';
import { TrustEstateModule } from './modules/trust-estate/trust-estate.module';
import { PersonalOfficeModule } from './modules/personal-office/personal-office.module';
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
    PrivateBankingModule,
    FamilyOfficeModule,
    RoboAdvisorModule,
    TrustEstateModule,
    PersonalOfficeModule,
    HealthModule,
  ],
})
export class AppModule {}
