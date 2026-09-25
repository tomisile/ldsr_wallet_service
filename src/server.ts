import { createApp } from './app';
import { env } from './config/env';
import { db } from './config/knex';

const app = createApp();

// Bind 0.0.0.0, not localhost: inside a container, loopback is unreachable
// from outside. PORT is injected by the platform in production.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`ldsr wallet service listening on port ${env.PORT} [${env.NODE_ENV}]`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
