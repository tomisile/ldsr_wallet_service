import { RequestHandler } from 'express';
import { ValidationError } from '../errors';

const HEADER = 'idempotency-key';
const MAX_LENGTH = 255;
export const requireIdempotencyKey: RequestHandler = (req, _res, next) => {
  const key = req.header(HEADER)?.trim();

  if (!key) {
    throw new ValidationError(`An ${HEADER} header is required for this request`);
  }

  if (key.length > MAX_LENGTH) {
    throw new ValidationError(`The ${HEADER} header must be at most ${MAX_LENGTH} characters`);
  }

  req.idempotencyKey = key;
  next();
};
