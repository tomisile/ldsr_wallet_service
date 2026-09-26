import { AuthenticatedUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, set by the requestId middleware. */
      id: string;
      /** Present only after the authenticate middleware has run. */
      user?: AuthenticatedUser;
      /** Present only after the requireIdempotencyKey middleware has run. */
      idempotencyKey?: string;
    }
  }
}

export {};
