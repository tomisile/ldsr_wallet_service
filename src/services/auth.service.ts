import bcrypt from 'bcryptjs';
import { db } from '../config/knex';
import {
  AccountBlockedError,
  BlacklistedUserError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../errors';
import * as userRepository from '../repositories/user.repository';
import * as walletRepository from '../repositories/wallet.repository';
import { UserRow } from '../repositories/user.repository';
import { WalletRow } from '../repositories/wallet.repository';
import { isPostgresError, UNIQUE_VIOLATION } from '../utils/postgres';
import { getBlacklistService } from './blacklist.service';
import { AuthenticatedUser, issueAccessToken } from './token.service';
import { LoginInput, RegisterInput } from '../validators/auth.schema';
const BCRYPT_COST = 12;
// Compared against when no user was found, so a request for an unknown email costs
// the same as one for a known email. Without it, response time leaks which
// addresses are registered.
const TIMING_DECOY_HASH = bcrypt.hashSync('timing_decoy', BCRYPT_COST);

export interface AuthResult {
  user: UserRow;
  wallet: WalletRow;
  token: string;
}

function toAuthenticatedUser(user: UserRow): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}
export async function register(input: RegisterInput): Promise<AuthResult> {
  if (await getBlacklistService().isBlacklisted(input.email)) {
    throw new BlacklistedUserError();
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  // The lookup is a fast path for the common case. Two concurrent registrations can
  // both pass it, so the unique constraint on email is what actually decides.
  const { user, wallet } = await db
    .transaction(async (trx) => {
      const existing = await userRepository.findByEmail(input.email, trx);

      if (existing) {
        throw new EmailAlreadyRegisteredError();
      }

      const created = await userRepository.insert(
        {
          email: input.email,
          password_hash: passwordHash,
          first_name: input.firstName,
          last_name: input.lastName,
        },
        trx,
      );

      return { user: created, wallet: await walletRepository.insertForUser(created.id, trx) };
    })
    .catch((error: unknown) => {
      if (isPostgresError(error, UNIQUE_VIOLATION)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    });

  return { user, wallet, token: issueAccessToken(toAuthenticatedUser(user)) };
}
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await userRepository.findByEmail(input.email);
  const matches = await bcrypt.compare(input.password, user?.password_hash ?? TIMING_DECOY_HASH);

  if (!user || !matches) {
    throw new InvalidCredentialsError();
  }

  if (user.status === 'BLOCKED') {
    throw new AccountBlockedError();
  }

  const wallet = await walletRepository.findByUserId(user.id);

  if (!wallet) {
    throw new Error(`User ${user.id} has no wallet`);
  }

  return { user, wallet, token: issueAccessToken(toAuthenticatedUser(user)) };
}
