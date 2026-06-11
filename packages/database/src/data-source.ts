import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

/**
 * TypeORM DataSource configuration.
 * Reads all connection parameters from environment variables.
 * Used by both the NestJS app and the TypeORM CLI for migrations.
 */
const options: DataSourceOptions = {
  type: 'postgres',
  host: process.env['DATABASE_HOST'] ?? 'localhost',
  port: parseInt(process.env['DATABASE_PORT'] ?? '5432', 10),
  username: process.env['DATABASE_USER'] ?? 'tpt_banking',
  password: process.env['DATABASE_PASSWORD'] ?? 'tpt_banking_dev',
  database: process.env['DATABASE_NAME'] ?? 'tpt_banking',

  // Entity discovery
  entities: [
    path.join(__dirname, 'entities', '**', '*.entity.{ts,js}'),
  ],

  // Migration discovery
  migrations: [
    path.join(__dirname, 'migrations', '*.{ts,js}'),
  ],

  // Run migrations automatically on app start (disable in production via env var)
  migrationsRun: process.env['DATABASE_RUN_MIGRATIONS'] === 'true',

  // Schema synchronisation MUST be false in production — use migrations
  synchronize: false,

  // Enable query logging in development
  logging:
    process.env['NODE_ENV'] === 'development'
      ? ['query', 'error', 'warn', 'migration']
      : ['error', 'warn', 'migration'],

  // Connection pool settings
  extra: {
    max: parseInt(process.env['DATABASE_POOL_MAX'] ?? '20', 10),
    min: parseInt(process.env['DATABASE_POOL_MIN'] ?? '2', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  ssl:
    process.env['DATABASE_SSL'] === 'true'
      ? {
          rejectUnauthorized:
            process.env['DATABASE_SSL_REJECT_UNAUTHORIZED'] !== 'false',
          ca: process.env['DATABASE_SSL_CA'],
        }
      : false,
};

/**
 * Singleton DataSource instance used by NestJS TypeOrmModule.forRootAsync
 * and the TypeORM CLI (migrations:run, etc.).
 */
export const AppDataSource = new DataSource(options);

export default AppDataSource;
