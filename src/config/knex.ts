import knex, { Knex } from 'knex';
import pg from 'pg';
import { env } from './env';

/*
 * node-postgres returns BIGINT (int8) as a string by default, to avoid silently
 * losing precision on values beyond IEEE-754 range. Balances are stored in minor
 * units, so parsing them as numbers is safe up to ~90 trillion naira, well past
 * anything this service will hold - and it keeps arithmetic in the domain layer
 * free of string coercion.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value));
export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './db/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
};

export const db = knex(knexConfig);
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await db.raw('select 1');
    return true;
  } catch {
    return false;
  }
}
