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
    .setTitle('TPT Banking — Prime Brokerage API')
    .setDescription(
      'Enterprise prime brokerage platform: collateral management (pledge/release, haircuts, ' +
      'eligibility schedules, optimization, substitution), margin call management ' +
      '(initial margin via SIMM/SPAN, variation margin, call workflow, cure/default), ' +
      'securities lending (loan agreements, SLAB, rebate/fee rates, recall, buy-in, ' +
      'corporate action handling), and prime brokerage services (leverage, synthetic ' +
      'exposure, financing, PB reporting).',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = parseInt(process.env['PB_PORT'] ?? '3010', 10);
  await app.listen(port);
  console.log(`Prime Brokerage API on http://localhost:${port}/v1`);
  console.log(`Swagger at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
