import { SystemWalletNotConfiguredError, WalletNotFoundError } from '../errors';
import * as walletRepository from '../repositories/wallet.repository';
import { move, MoveResult } from './ledger.service';

export interface CreditRequest {
  initiatorUserId: string;
  walletId: string;
  amount: number;
  idempotencyKey: string;
}
export async function creditWallet(request: CreditRequest): Promise<MoveResult> {
  const systemWallet = await walletRepository.findSystemWallet();

  if (!systemWallet) {
    throw new SystemWalletNotConfiguredError();
  }

  const destination = await walletRepository.findById(request.walletId);

  if (!destination || destination.type === 'SYSTEM') {
    throw new WalletNotFoundError();
  }

  return move({
    fromWalletId: systemWallet.id,
    toWalletId: destination.id,
    amount: request.amount,
    type: 'CREDIT',
    initiatedBy: request.initiatorUserId,
    idempotencyKey: request.idempotencyKey,
  });
}
