import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter, GlobalValidationPipe, LoggingInterceptor } from '@tpt/common';
import { RolesGuard } from '@tpt/auth';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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

  const port = parseInt(process.env['OPEN_BANKING_PORT'] ?? '3003', 10);
  await app.listen(port);
  console.log(`Open Banking API on http://localhost:${port}`);
  console.log(`Docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
