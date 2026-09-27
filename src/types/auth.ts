export type UserRole = 'USER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'BLOCKED';
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
