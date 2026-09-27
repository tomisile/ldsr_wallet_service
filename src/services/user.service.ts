import { ForbiddenError, UserNotFoundError, WalletNotFoundError } from '../errors';
import * as blacklistRepository from '../repositories/blacklist.repository';
import * as userRepository from '../repositories/user.repository';
import * as walletRepository from '../repositories/wallet.repository';
import { UserRow } from '../repositories/user.repository';
import { WalletRow } from '../repositories/wallet.repository';
export async function blockUser(actingAdminId: string, userId: string): Promise<UserRow> {
  if (actingAdminId === userId) {
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
export async function findBlacklistedUsers() {
  return blacklistRepository.findBlacklistedUsers();
}
