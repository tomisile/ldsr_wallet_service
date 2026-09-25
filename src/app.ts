import express, { Express } from 'express';
import healthRoutes from './routes/health.routes';

/**
 * Builds the Express application without binding a port, so that tests can
 * import it directly via supertest and the server entrypoint stays trivial.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.disable('x-powered-by');

  app.use(healthRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'NotFound', message: 'Route not found' });
  });

  return app;
}
