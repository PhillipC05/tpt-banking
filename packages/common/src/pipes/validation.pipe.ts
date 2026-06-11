import { ValidationPipe as NestValidationPipe } from '@nestjs/common';

/**
 * Global validation pipe configuration.
 *
 * - `whitelist: true`           — strips unknown properties from DTOs
 * - `forbidNonWhitelisted: true` — throws 400 if unknown properties are present
 * - `transform: true`           — auto-transforms plain objects to class instances
 * - `transformOptions`          — enables implicit type conversion (string → number, etc.)
 */
export const GlobalValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
});
