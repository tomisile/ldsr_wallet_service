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
import { getBlacklistService } from './blacklist.service';
import { AuthenticatedUser, issueAccessToken } from './token.service';
import { LoginInput, RegisterInput } from '../validators/auth.schema';

/**
 * Cost factor 12: deliberately slow, because the point of a password hash is to
 * make offline brute force expensive. Roughly 250ms per hash on modest hardware.
 */
const BCRYPT_COST = 12;

/**
 * A hash to compare against when no user was found, so that a request for an
 * unknown email costs the same as one for a known email. Without it, response
 * time leaks which addresses are registered.
 */
const TIMING_DECOY_HASH = bcrypt.hashSync('timing_decoy', BCRYPT_COST);

export interface AuthResult {
  user: UserRow;
  wallet: WalletRow;
  token: string;
}

function toAuthenticatedUser(user: UserRow): AuthenticatedUser {
  return { id: user.id, email: user.email, role: user.role };
}

/**
 * Creates an account and its wallet.
 *
 * The blacklist is checked before the transaction opens: it is the only step
 * that could become a network call, and an open transaction should never wait on
 * an external service.
 *
 * The user and the wallet are written in a single transaction. A user without a
 * wallet could not transact, so committing one without the other would leave an
 * account that looks registered but cannot be used.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  if (await getBlacklistService().isBlacklisted(input.email)) {
    throw new BlacklistedUserError();
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const { user, wallet } = await db.transaction(async (trx) => {
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
  });

  return { user, wallet, token: issueAccessToken(toAuthenticatedUser(user)) };
}

/**
 * Authenticates an existing account.
 *
 * A wrong email and a wrong password return the same error, so the response
 * cannot be used to enumerate registered addresses.
 */
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
    // Registration writes both in one transaction, so this is unreachable
    // unless data was altered out of band.
    throw new Error(`User ${user.id} has no wallet`);
  }

  return { user, wallet, token: issueAccessToken(toAuthenticatedUser(user)) };
}
