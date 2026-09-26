import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError, ValidationError } from '../errors';
import { env } from '../config/env';

/** Terminal handler for any route that did not match. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route matches ${req.method} ${req.path}`));
};

/**
 * The single place where an error becomes an HTTP response.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so controllers throw and never catch.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error instanceof ValidationError && error.details ? { details: error.details } : {}),
      requestId: req.id,
    });
    return;
  }

  // Anything reaching here is unexpected, so it is logged in full and reported
  // without internal detail. Leaking a stack trace or a driver message to a
  // caller is an information disclosure risk.
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled error',
      requestId: req.id,
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );

  res.status(500).json({
    error: 'InternalServerError',
    message:
      env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error instanceof Error
          ? error.message
          : String(error),
    requestId: req.id,
  });
};
