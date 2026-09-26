import { SystemWalletNotConfiguredError, WalletNotFoundError } from '../errors';
import * as walletRepository from '../repositories/wallet.repository';
import { move, MoveResult } from './ledger.service';

export interface CreditRequest {
  /** The administrator performing the credit. */
  initiatorUserId: string;
  walletId: string;
  amount: number;
  idempotencyKey: string;
}

/**
 * Places funds into a wallet.
 *
 * This is an administrative seeding mechanism, and the reason it is restricted to
 * administrators is blunt: a user able to credit their own wallet can mint money.
 *
 * It is modelled as a transfer out of the SYSTEM wallet rather than as a balance
 * increment, so double entry holds, the ledger records a counterparty, and this
 * path reuses the same locking and idempotency as an ordinary transfer instead of
 * reimplementing them.
 *
 * In a production system funds would arrive through a payment provider webhook
 * after confirmed settlement, carrying the provider's reference and reconciled
 * against its settlement report, never through a direct API call.
 */
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
