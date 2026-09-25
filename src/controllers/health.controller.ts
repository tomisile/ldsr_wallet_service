import { Request, Response } from 'express';
import { isDatabaseReachable } from '../config/knex';

/**
 * Reports whether the service can actually serve traffic, which means
 * checking its dependencies rather than returning a bare 200.
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const dbReachable = await isDatabaseReachable();

  res.status(dbReachable ? 200 : 503).json({
    ok: dbReachable,
    db: dbReachable ? 'connected' : 'unreachable',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
