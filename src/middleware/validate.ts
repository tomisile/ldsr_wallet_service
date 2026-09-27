import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../errors';
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
export function validateParams(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      throw new ValidationError(
        'The request path is invalid',
        result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(path)',
          message: issue.message,
        })),
      );
    }

    next();
  };
}
