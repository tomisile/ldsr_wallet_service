import { AuthenticatedUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: AuthenticatedUser;
      idempotencyKey?: string;
    }
  }
}

export {};
