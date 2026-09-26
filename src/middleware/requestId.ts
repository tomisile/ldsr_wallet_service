import { randomUUID } from 'node:crypto';
import { RequestHandler } from 'express';

/**
 * Attaches an identifier to every request, echoed in the response header and in
 * error bodies, so a single call can be traced through the logs.
 *
 * An inbound X-Request-Id is honoured, which lets a caller correlate across
 * services rather than only within this one.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.header('x-request-id');
  req.id = inbound && inbound.length <= 128 ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
