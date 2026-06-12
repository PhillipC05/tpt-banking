import 'reflect-metadata';
import { initTelemetry } from '@tpt/telemetry';
initTelemetry('compliance');
import { NestFactory, Reflector } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter, GlobalValidationPipe, LoggingInterceptor } from '@tpt/common';
import { RolesGuard } from '@tpt/auth';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet());
  app.useGlobalPipes(GlobalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalGuards(new RolesGuard(app.get(Reflector)));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const config = new DocumentBuilder()
    .setTitle('TPT Banking — Compliance API')
    .setDescription('KYC, AML, sanctions screening, case management, SAR/CTR filing')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = parseInt(process.env['COMPLIANCE_PORT'] ?? '3002', 10);
  await app.listen(port);
  console.log(`Compliance API on http://localhost:${port}/v1`);
  console.log(`Docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
