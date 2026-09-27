import express, { Express } from 'express';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import transferRoutes from './routes/transfer.routes';
import walletRoutes from './routes/wallet.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
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
