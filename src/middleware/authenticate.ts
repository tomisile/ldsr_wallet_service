import { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { verifyAccessToken } from '../services/token.service';
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('A Bearer token is required');
  }

  req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
  next();
};
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required');
  }

  if (req.user.role !== 'ADMIN') {
    throw new ForbiddenError('This action requires an administrator');
  }

  next();
};
