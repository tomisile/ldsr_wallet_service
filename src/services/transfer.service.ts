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
  initiatorUserId: string;
  toWalletId: string;
  amount: number;
  idempotencyKey: string;
}
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
    throw new WalletNotFoundError();
  }

  if (destinationWallet.id === sourceWallet.id) {
    throw new SelfTransferError();
  }

  if (destinationWallet.user_id) {
    const recipient = await userRepository.findById(destinationWallet.user_id);

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
