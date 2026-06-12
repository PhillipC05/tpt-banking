import 'reflect-metadata';
import { initTelemetry } from '@tpt/telemetry';
initTelemetry('open-banking');
import { NestFactory, Reflector } from '@nestjs/core';
import { VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter, GlobalValidationPipe, LoggingInterceptor } from '@tpt/common';
import { RolesGuard } from '@tpt/auth';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Connect Kafka microservice for outbound TPP webhook delivery consumer
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'open-banking',
        brokers: [(process.env['KAFKA_BROKERS'] ?? 'localhost:9092')],
      },
      consumer: { groupId: 'ob-webhook-delivery-group' },
    },
  });
  // OBIE/PSD2/FDX controllers carry their own version segment in the path.
  // VERSION_NEUTRAL default avoids a /v1/ prefix on those standard paths while
  // allowing OAuth2 / generic controllers to opt in with @Version('1').
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
  app.use(helmet());
  app.useGlobalPipes(GlobalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalGuards(new RolesGuard(app.get(Reflector)));

  const config = new DocumentBuilder()
    .setTitle('TPT Banking — Open Banking API')
    .setDescription(
      'OAuth2 authorization server + UK OBIE v3.1, PSD2/NextGenPSD2, FDX v6, and Generic OAuth2+PKCE APIs.',
    )
    .setVersion('1.0.0')
    .addOAuth2({
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: '/oauth2/authorize',
          tokenUrl: '/oauth2/token',
          scopes: {
            accounts: 'Read account information (AISP)',
            payments: 'Initiate payments (PISP)',
            openid: 'OpenID Connect identity',
          },
        },
      },
    })
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.startAllMicroservices();

  const port = parseInt(process.env['OPEN_BANKING_PORT'] ?? '3003', 10);
  await app.listen(port);
  console.log(`Open Banking API on http://localhost:${port}`);
  console.log(`Docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
