import { ForbiddenError, UserNotFoundError, WalletNotFoundError } from '../errors';
import * as blacklistRepository from '../repositories/blacklist.repository';
import * as userRepository from '../repositories/user.repository';
import * as walletRepository from '../repositories/wallet.repository';
import { UserRow } from '../repositories/user.repository';
import { WalletRow } from '../repositories/wallet.repository';

/**
 * Blocks an account.
 *
 * A blocked account cannot log in, cannot send funds and cannot receive them.
 * Blocking in one direction only would let a balance accumulate that its owner
 * has no way to reach.
 *
 * Deliberately idempotent: blocking an account that is already blocked reports
 * the same result rather than failing. The caller's intent is a desired state,
 * not a state transition.
 */
export async function blockUser(actingAdminId: string, userId: string): Promise<UserRow> {
  if (actingAdminId === userId) {
    // An administrator blocking themselves cannot log in to undo it.
    throw new ForbiddenError('An administrator cannot block their own account');
  }

  const user = await userRepository.findById(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  if (user.status === 'BLOCKED') {
    return user;
  }

  const updated = await userRepository.setStatus(userId, 'BLOCKED');

  if (!updated) {
    throw new UserNotFoundError();
  }

  return updated;
}

/** Restores a blocked account. Idempotent for the same reason as blocking. */
export async function unblockUser(userId: string): Promise<UserRow> {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  if (user.status === 'ACTIVE') {
    return user;
  }

  const updated = await userRepository.setStatus(userId, 'ACTIVE');

  if (!updated) {
    throw new UserNotFoundError();
  }

  return updated;
}

export async function getOwnWallet(userId: string): Promise<WalletRow> {
  const wallet = await walletRepository.findByUserId(userId);

  if (!wallet) {
    throw new WalletNotFoundError();
  }

  return wallet;
}

/**
 * Reports the existing accounts that appear on the blacklist.
 *
 * Screening at registration only catches an identity already on the list. A
 * blacklist changes, so an account that was clean when it was opened can appear on
 * one later, and this is how that is found.
 *
 * It reports and does not act. Blocking stays an explicit decision through
 * blockUser, so there is one code path that blocks an account and one audit entry
 * per decision. An endpoint that froze accounts in bulk as a side effect is not
 * something anyone could undo confidently.
 */
export async function findBlacklistedUsers() {
  return blacklistRepository.findBlacklistedUsers();
}
