/*
 * Knex CLI configuration.
 *
 * Deliberately plain JavaScript, reading the environment directly: the
 * production image runs compiled JavaScript and carries no TypeScript
 * toolchain, so the same migration files must be runnable in development, CI
 * and production without a build step in between.
 */
require('dotenv').config();

const useSsl = process.env.DATABASE_SSL === 'true';

/** @type {import('knex').Knex.Config} */
const config = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  },
  pool: { min: 1, max: 5 },
  migrations: {
    directory: './db/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
};

module.exports = {
  development: config,
  test: config,
  production: config,
};
