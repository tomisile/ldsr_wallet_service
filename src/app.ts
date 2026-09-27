import express, { Express } from 'express';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import transferRoutes from './routes/transfer.routes';
import walletRoutes from './routes/wallet.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';

/**
 * Builds the Express application without binding a port, so that tests can
 * import it directly via supertest and the server entrypoint stays trivial.
 *
 * Order matters: correlation id first so everything downstream can log it,
 * routes next, then the catch-all 404, and the error handler last because
 * Express only treats a four argument middleware as an error handler.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRoutes);
  app.use(authRoutes);
  app.use(walletRoutes);
  app.use(transferRoutes);
  app.use(adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
