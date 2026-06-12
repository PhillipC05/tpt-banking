/**
 * Jest globalSetup — runs once before all integration test suites.
 *
 * Connects to the real PostgreSQL instance (must be running via docker:up)
 * and runs all pending migrations so the schema is up to date.
 *
 * Required env vars (or defaults):
 *   DATABASE_HOST     (default: localhost)
 *   DATABASE_PORT     (default: 5432)
 *   DATABASE_USER     (default: tpt_banking)
 *   DATABASE_PASSWORD (default: tpt_banking_dev)
 *   DATABASE_NAME     (default: tpt_banking_test)
 */
import { DataSource } from 'typeorm';
import * as path from 'path';

export default async function setup(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env['DATABASE_HOST'] ?? 'localhost',
    port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
    username: process.env['DATABASE_USER'] ?? 'tpt_banking',
    password: process.env['DATABASE_PASSWORD'] ?? 'tpt_banking_dev',
    database: process.env['DATABASE_NAME'] ?? 'tpt_banking_test',
    entities: [path.join(__dirname, '../../entities/**/*.entity.{ts,js}')],
    migrations: [path.join(__dirname, '../../migrations/*.{ts,js}')],
    synchronize: false,
    logging: false,
  });

  await ds.initialize();
  await ds.runMigrations();
  await ds.destroy();

  // Store connection config in global for test files to reuse
  (global as Record<string, unknown>).__DB_CONFIG__ = {
    type: 'postgres',
    host: process.env['DATABASE_HOST'] ?? 'localhost',
    port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
    username: process.env['DATABASE_USER'] ?? 'tpt_banking',
    password: process.env['DATABASE_PASSWORD'] ?? 'tpt_banking_dev',
    database: process.env['DATABASE_NAME'] ?? 'tpt_banking_test',
  };

  console.log('[integration] Database ready.');
}
