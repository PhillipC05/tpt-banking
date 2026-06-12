/**
 * Swagger / OpenAPI spec generator.
 *
 * Boots each NestJS app in "spec-only" mode, exports the OpenAPI JSON to
 * docs/openapi/<app-name>.json, and exits — no server binds a port.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/generate-swagger.ts
 *
 * Output: docs/openapi/{banking-core,compliance,open-banking,...}.json
 */

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

interface AppSpec {
  name: string;
  modulePath: string;
}

const APPS: AppSpec[] = [
  { name: 'banking-core',          modulePath: '../apps/banking-core/src/app.module' },
  { name: 'api-gateway',           modulePath: '../apps/api-gateway/src/app.module' },
  { name: 'compliance',            modulePath: '../apps/compliance/src/app.module' },
  { name: 'open-banking',          modulePath: '../apps/open-banking/src/app.module' },
  { name: 'investment-banking',    modulePath: '../apps/investment-banking/src/app.module' },
  { name: 'pricing-engine',        modulePath: '../apps/pricing-engine/src/app.module' },
  { name: 'risk-analytics',        modulePath: '../apps/risk-analytics/src/app.module' },
  { name: 'regulatory-reporting',  modulePath: '../apps/regulatory-reporting/src/app.module' },
  { name: 'treasury',              modulePath: '../apps/treasury/src/app.module' },
  { name: 'wealth-management',     modulePath: '../apps/wealth-management/src/app.module' },
  { name: 'prime-brokerage',       modulePath: '../apps/prime-brokerage/src/app.module' },
];

const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'openapi');

async function generateSpec(spec: AppSpec): Promise<void> {
  // Dynamically import the app module to avoid circular deps at load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require(spec.modulePath) as { AppModule: new () => unknown };

  const app = await NestFactory.create(AppModule, { logger: false });
  // NestFactory generates the Swagger document without booting HTTP
  const document = SwaggerModule.createDocument(app, {
    openapi: '3.0.3',
    info: {
      title: `TPT Banking — ${spec.name}`,
      version: '1.0.0',
      description: `Auto-generated OpenAPI spec for ${spec.name}`,
    },
    paths: {},
  });

  await app.close();

  const outPath = path.join(OUT_DIR, `${spec.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf8');
  console.log(`  ✓  ${spec.name} → ${outPath}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('Generating OpenAPI specs...\n');

  for (const spec of APPS) {
    try {
      await generateSpec(spec);
    } catch (err) {
      console.error(`  ✗  ${spec.name}: ${(err as Error).message}`);
    }
  }

  console.log('\nDone. Specs written to docs/openapi/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
