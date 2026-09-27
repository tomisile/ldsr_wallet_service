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

/** 422: the request is well formed, but the outcome is not permitted. */
export class UnprocessableError extends AppError {
  readonly statusCode: number = 422;
  readonly code: string = 'Unprocessable';
}

export class InsufficientFundsError extends UnprocessableError {
  override readonly code = 'InsufficientFunds';

  constructor() {
    super('The source wallet does not have sufficient funds');
  }
}

export class WalletNotFoundError extends NotFoundError {
  override readonly code = 'WalletNotFound';

  constructor() {
    super('No wallet matches the given identifier');
  }
}

export class SelfTransferError extends ValidationError {
  override readonly code = 'SelfTransfer';

  constructor() {
    super('A transfer must be between two different wallets');
  }
}

/**
 * 409: the idempotency key was already used, but with a different request.
 *
 * Returning the original result here would tell the caller that a transfer
 * succeeded when a different transfer is the one that actually happened.
 */
export class IdempotencyKeyConflictError extends ConflictError {
  override readonly code = 'IdempotencyKeyConflict';

  constructor() {
    super('This idempotency key was already used with a different request');
  }
}

export class RecipientBlockedError extends ForbiddenError {
  override readonly code = 'RecipientBlocked';

  constructor() {
    super('The recipient account is blocked and cannot receive funds');
  }
}

export class UserNotFoundError extends NotFoundError {
  override readonly code = 'UserNotFound';

  constructor() {
    super('No user matches the given identifier');
  }
}

export class SystemWalletNotConfiguredError extends AppError {
  readonly statusCode = 503;
  readonly code = 'SystemWalletNotConfigured';

  constructor() {
    super('The system wallet is missing; the database has not been seeded');
  }
}
