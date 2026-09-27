import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors';
import { AuthenticatedUser, UserRole } from '../types/auth';

export type { AuthenticatedUser, UserRole };

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
export function issueAccessToken(user: AuthenticatedUser): string {
  const payload: TokenPayload = { sub: user.id, email: user.email, role: user.role };
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return { id: decoded.sub, email: decoded.email, role: decoded.role };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired');
    }
    throw new UnauthorizedError('Access token is invalid');
  }
}
