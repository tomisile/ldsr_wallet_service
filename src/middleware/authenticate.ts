import { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { verifyAccessToken } from '../services/token.service';

/**
 * Establishes who the caller is. Says nothing about what they may do.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('A Bearer token is required');
  }

  req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
  next();
};

/**
 * Establishes what the caller may do. Must run after authenticate.
 *
 * Crediting a wallet and blocking an account are privileged operations: a user
 * able to credit their own wallet could mint money, so these are separated from
 * ordinary account holders by role rather than by obscurity.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required');
  }

  if (req.user.role !== 'ADMIN') {
    throw new ForbiddenError('This action requires an administrator');
  }

  next();
};
