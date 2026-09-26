/**
 * Identity types shared by the token service, the repositories and the Express
 * request augmentation. They live here rather than in a service so that the
 * global type augmentation does not have to depend on an implementation.
 */
export type UserRole = 'USER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'BLOCKED';

/** The caller, as established from a verified access token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
