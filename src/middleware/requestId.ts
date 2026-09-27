import { randomUUID } from 'node:crypto';
import { RequestHandler } from 'express';
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.header('x-request-id');
  req.id = inbound && inbound.length <= 128 ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
