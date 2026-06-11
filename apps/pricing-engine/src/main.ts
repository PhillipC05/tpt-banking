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
  app.setGlobalPrefix('v1');

  const config = new DocumentBuilder()
    .setTitle('TPT Banking — Pricing Engine API')
    .setDescription(
      'Quantitative pricing engine: Black-Scholes, Monte Carlo, binomial tree, ' +
      'yield curve construction, IRS/CDS pricing, FX forwards, real-time market data.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = parseInt(process.env['PRICING_PORT'] ?? '3005', 10);
  await app.listen(port);
  console.log(`Pricing Engine on http://localhost:${port}/v1`);
  console.log(`WebSocket on ws://localhost:${port}`);
  console.log(`Swagger at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
