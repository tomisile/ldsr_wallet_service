// Plain JavaScript: the production image carries no TypeScript toolchain.
require('dotenv').config();

const useSsl = process.env.DATABASE_SSL === 'true';

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
