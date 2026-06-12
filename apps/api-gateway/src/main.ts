import 'reflect-metadata';
import { initTelemetry } from '@tpt/telemetry';
initTelemetry('api-gateway');
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter, GlobalValidationPipe, LoggingInterceptor } from '@tpt/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const isProd = process.env['NODE_ENV'] === 'production';

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
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

  const corsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3002').split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Step-Up-Token'],
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(GlobalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const config = new DocumentBuilder()
    .setTitle('TPT Banking — API Gateway')
    .setDescription('API Gateway — routes to core banking, investment banking, compliance, and other services')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = parseInt(process.env['API_GATEWAY_PORT'] ?? '3001', 10);
  await app.listen(port);
  console.log(`API Gateway running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Failed to start API Gateway:', err);
  process.exit(1);
});
