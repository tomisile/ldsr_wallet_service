import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError, ValidationError } from '../errors';
import { env } from '../config/env';
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route matches ${req.method} ${req.path}`));
};
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
