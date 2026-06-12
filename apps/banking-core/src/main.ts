import 'reflect-metadata';
import { initTelemetry } from '@tpt/telemetry';
initTelemetry('banking-core');
import { NestFactory, Reflector } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@tpt/common';
import { GlobalValidationPipe } from '@tpt/common';
import { LoggingInterceptor } from '@tpt/common';
import { RolesGuard } from '@tpt/auth';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger:  ['log', 'warn', 'error', 'debug'],
    rawBody: true,
  });

  const isProd = process.env['NODE_ENV'] === 'production';

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // HSTS: enforce HTTPS for 2 years in production
    hsts: isProd
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
      : false,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  }));
  app.use(compression());
  app.use(cookieParser());

  // CORS
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3002').split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Step-Up-Token'],
  });

  // Global pipes, filters, interceptors
  app.useGlobalPipes(GlobalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  // TraceInterceptor is registered via TelemetryModule (global) in AppModule
  app.useGlobalGuards(new RolesGuard(app.get(Reflector)));

  // URI versioning: routes at /v1/...; future v2 routes use @Version('2') on controllers
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('TPT Banking — Core Banking API')
    .setDescription(
      'Core banking platform API. Covers accounts, customers, ledger, transfers, auth, KYC, and payments.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: 'Idempotency-Key' }, 'idempotency-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen(port);
  console.log(`Banking Core API running on http://localhost:${port}/v1`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Failed to start Banking Core:', err);
  process.exit(1);
});
