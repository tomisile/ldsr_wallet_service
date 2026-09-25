import knex, { Knex } from 'knex';
import { env } from './env';

/**
 * SSL is required when reaching a managed Postgres over the public internet
 * (Render's external connection string). It is not used locally, nor over
 * Render's internal network, so it is driven by an explicit flag rather than
 * inferred from NODE_ENV.
 */
export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './db/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './db/seeds',
    extension: 'ts',
  },
};

export const db = knex(knexConfig);

/** Cheap liveness probe for the database connection. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await db.raw('select 1');
    return true;
  } catch {
    return false;
  }
}
