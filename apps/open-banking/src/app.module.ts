import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppDataSource } from '@tpt/database';
import { OAuth2Module } from './modules/oauth2/oauth2.module';
import { ConsentModule } from './modules/consent/consent.module';
import { ObieModule } from './modules/obie/obie.module';
import { Psd2Module } from './modules/psd2/psd2.module';
import { FdxModule } from './modules/fdx/fdx.module';
import { ClientsModule } from './modules/clients/clients.module';

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
    ClientsModule,
    OAuth2Module,
    ConsentModule,
    ObieModule,
    Psd2Module,
    FdxModule,
  ],
})
export class AppModule {}
