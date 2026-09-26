import {
  AccountBlockedError,
  RecipientBlockedError,
  SelfTransferError,
  WalletNotFoundError,
} from '../errors';
import * as userRepository from '../repositories/user.repository';
import * as walletRepository from '../repositories/wallet.repository';
import { move, MoveResult } from './ledger.service';

export interface TransferRequest {
  /** The authenticated caller. The source wallet is derived from this, never from the body. */
  initiatorUserId: string;
  toWalletId: string;
  amount: number;
  idempotencyKey: string;
}

/**
 * Moves funds from the caller's own wallet to another wallet.
 *
 * The source wallet is looked up from the authenticated user rather than taken
 * from the request body. Accepting a source and then checking ownership would
 * work, but deriving it removes the possibility of that check being forgotten,
 * which is the usual shape of an authorisation bug on a money endpoint.
 *
 * Eligibility is checked before the transaction opens, so a rejected request
 * never takes a row lock.
 */
export async function transfer(request: TransferRequest): Promise<MoveResult> {
  const initiator = await userRepository.findById(request.initiatorUserId);

  if (!initiator) {
    throw new WalletNotFoundError();
  }

  if (initiator.status === 'BLOCKED') {
    throw new AccountBlockedError();
  }

  const sourceWallet = await walletRepository.findByUserId(initiator.id);

  if (!sourceWallet) {
    throw new WalletNotFoundError();
  }

  const destinationWallet = await walletRepository.findById(request.toWalletId);

  if (!destinationWallet || destinationWallet.type === 'SYSTEM') {
    // The SYSTEM wallet is not addressable by users. Exposing it would let a
    // caller push funds out of circulation.
    throw new WalletNotFoundError();
  }

  if (destinationWallet.id === sourceWallet.id) {
    throw new SelfTransferError();
  }

  if (destinationWallet.user_id) {
    const recipient = await userRepository.findById(destinationWallet.user_id);

    // A blocked account is out of use in both directions. Letting funds land in
    // one would create a balance its owner cannot reach.
    if (recipient?.status === 'BLOCKED') {
      throw new RecipientBlockedError();
    }
  }

  return move({
    fromWalletId: sourceWallet.id,
    toWalletId: destinationWallet.id,
    amount: request.amount,
    type: 'TRANSFER',
    initiatedBy: initiator.id,
    idempotencyKey: request.idempotencyKey,
  });
}
