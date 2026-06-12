import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

/**
 * Creates and initialises a DataSource for integration tests.
 * Each test suite should call this in beforeAll() and destroy() in afterAll().
 */
export async function createTestDataSource(): Promise<DataSource> {
  const dbConfig = ((global as Record<string, unknown>).__DB_CONFIG__ ?? {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'tpt_banking',
    password: 'tpt_banking_dev',
    database: 'tpt_banking_test',
  }) as Partial<DataSourceOptions>;

  const ds = new DataSource({
    ...dbConfig,
    type: 'postgres',
    entities: [path.join(__dirname, '../../entities/**/*.entity.{ts,js}')],
    synchronize: false,
    logging: false,
  } as DataSourceOptions);

  await ds.initialize();
  return ds;
}

/**
 * Clears rows from the given tables in reverse-dependency order.
 * Uses TRUNCATE ... CASCADE to respect FK constraints.
 */
export async function truncateTables(ds: DataSource, tables: string[]): Promise<void> {
  await ds.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
}
