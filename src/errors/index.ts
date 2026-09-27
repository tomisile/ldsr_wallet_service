export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}
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
export class UnauthorizedError extends AppError {
  readonly statusCode: number = 401;
  readonly code: string = 'Unauthorized';
}
export class ForbiddenError extends AppError {
  readonly statusCode: number = 403;
  readonly code: string = 'Forbidden';
}
export class NotFoundError extends AppError {
  readonly statusCode: number = 404;
  readonly code: string = 'NotFound';
}
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
