import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../errors';

/**
 * Validates and replaces the request body with the parsed result, so handlers
 * downstream receive a typed, trimmed, normalised value and never re-check it.
 *
 * Rejecting bad input at the boundary keeps the service layer free of defensive
 * checks, and returns a useful message instead of a database constraint error.
 */
export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new ValidationError(
        'The request body is invalid',
        result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          message: issue.message,
        })),
      );
    }

    req.body = result.data;
    next();
  };
}
