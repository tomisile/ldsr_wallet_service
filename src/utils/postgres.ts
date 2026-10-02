export const UNIQUE_VIOLATION = '23505';
export const CHECK_VIOLATION = '23514';

export function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
