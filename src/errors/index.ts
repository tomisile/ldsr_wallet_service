/**
 * Domain errors.
 *
 * Services throw these; a single error handling middleware maps them to status
 * codes and a consistent response body. Controllers therefore contain no
 * try/catch and no status code decisions, and every status code this API can
 * return is visible in one place.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 400: the request itself is malformed. */
export class ValidationError extends AppError {
  readonly statusCode: number = 400;
  readonly code: string = 'ValidationError';

  constructor(
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

/** 401: no credentials, or credentials that do not identify anyone. */
export class UnauthorizedError extends AppError {
  readonly statusCode: number = 401;
  readonly code: string = 'Unauthorized';
}

/** 403: identified, but not permitted to do this. */
export class ForbiddenError extends AppError {
  readonly statusCode: number = 403;
  readonly code: string = 'Forbidden';
}

/** 404 */
export class NotFoundError extends AppError {
  readonly statusCode: number = 404;
  readonly code: string = 'NotFound';
}

/** 409: the request conflicts with the current state. */
export class ConflictError extends AppError {
  readonly statusCode: number = 409;
  readonly code: string = 'Conflict';
}

export class EmailAlreadyRegisteredError extends ConflictError {
  override readonly code = 'EmailAlreadyRegistered';

  constructor() {
    super('An account with that email address already exists');
  }
}

export class BlacklistedUserError extends ForbiddenError {
  override readonly code = 'BlacklistedUser';

  constructor() {
    super('This identity appears on the blacklist and cannot be onboarded');
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  override readonly code = 'InvalidCredentials';

  constructor() {
    super('Email or password is incorrect');
  }
}

export class AccountBlockedError extends ForbiddenError {
  override readonly code = 'AccountBlocked';

  constructor() {
    super('This account is blocked');
  }
}
