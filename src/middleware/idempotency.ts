import { RequestHandler } from 'express';
import { ValidationError } from '../errors';

const HEADER = 'idempotency-key';
const MAX_LENGTH = 255;

/**
 * Requires a client generated idempotency key on any request that moves money.
 *
 * The key has to come from the caller: the point is that a retry carries the
 * same value, and a server generated one would differ on every attempt. Its real
 * purpose is not the double tapped button but the lost response, where a request
 * succeeded and the caller never found out, so the only safe thing it can do is
 * send the same request again.
 *
 * A missing key is rejected rather than defaulted, because proceeding without one
 * silently gives up replay protection on a money endpoint.
 */
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
