import 'reflect-metadata';
import { initTelemetry } from '@tpt/telemetry';
initTelemetry('wealth-management');
import { NestFactory, Reflector } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
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
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const config = new DocumentBuilder()
    .setTitle('TPT Banking — Wealth Management API')
    .setDescription(
      'Enterprise wealth management: private banking (HNW/UHNW tier management, VIP concierge, RM assignment), ' +
      'family office (multi-entity consolidation, entity graph, beneficiary management, IPS enforcement, ' +
      'encrypted document vault, GIPS-compliant household reporting), ' +
      'robo-advisor (automated rebalancing, tax-loss harvesting), ' +
      'and trust & estate services.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = parseInt(process.env['WEALTH_PORT'] ?? '3009', 10);
  await app.listen(port);
  console.log(`Wealth Management API on http://localhost:${port}/v1`);
  console.log(`Swagger at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
