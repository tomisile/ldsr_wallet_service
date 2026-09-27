import { Knex } from 'knex';
import { db } from '../config/knex';
import { IdempotencyKeyConflictError, InsufficientFundsError, SelfTransferError } from '../errors';
import * as ledgerRepository from '../repositories/ledger.repository';
import * as transactionRepository from '../repositories/transaction.repository';
import * as walletRepository from '../repositories/wallet.repository';
import { TransactionRow, TransactionType } from '../repositories/transaction.repository';
import { WalletRow } from '../repositories/wallet.repository';
import { fingerprintRequest, generateReference } from '../utils/reference';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

export interface MoveRequest {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  type: TransactionType;
  initiatedBy: string;
  idempotencyKey: string;
}

export interface MoveResult {
  transaction: TransactionRow;
  fromBalanceAfter: number;
  toBalanceAfter: number;
  replayed: boolean;
}

function isPostgresError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * The only place in this service where money moves.
 *
 * Transfers and administrative credits both call it, so there is a single
 * implementation of locking, idempotency and double entry rather than one per
 * endpoint. A second implementation is a second chance to get it wrong.
 *
 * The sequence inside the transaction matters:
 *
 * 1. Lock both wallets with FOR UPDATE, in ascending id order. Ordering prevents
 *    the deadlock where A to B and B to A each hold the lock the other wants.
 *
 * 2. Read balances from the locked rows. A balance read taken before the lock is
 *    stale by definition, so the sufficiency check has to happen on the
 *    post-lock read.
 *
 * 3. Insert the transaction row. It must come after the locks: inserting a row
 *    whose foreign keys reference both wallets takes a FOR KEY SHARE lock on
 *    them, and a share lock held by one transaction blocks another from
 *    upgrading to FOR UPDATE, so inserting first makes concurrent transfers
 *    deadlock on each other.
 *
 *    The unique constraint on (initiated_by, idempotency_key) is what rejects a
 *    replay. Checking for an existing key in application code instead would
 *    leave a window between the check and the insert for a concurrent duplicate
 *    to slip through; the constraint has no such window.
 *
 * 4. Write both balances and both ledger entries.
 *
 * Either all of that commits or none of it does. A crash between the debit and
 * the credit rolls back, including the idempotency row, so the key is released
 * and the caller may retry.
 */
export async function move(request: MoveRequest): Promise<MoveResult> {
  if (request.fromWalletId === request.toWalletId) {
    throw new SelfTransferError();
  }

  const fingerprint = fingerprintRequest({
    from: request.fromWalletId,
    to: request.toWalletId,
    amount: request.amount,
    type: request.type,
  });

  try {
    return await db.transaction(async (trx) => applyMovement(trx, request, fingerprint));
  } catch (error) {
    if (isPostgresError(error, UNIQUE_VIOLATION)) {
      return replay(request, fingerprint);
    }

    if (isPostgresError(error, CHECK_VIOLATION)) {
      throw new InsufficientFundsError();
    }

    throw error;
  }
}

async function applyMovement(
  trx: Knex.Transaction,
  request: MoveRequest,
  fingerprint: string,
): Promise<MoveResult> {
  const locked = await walletRepository.lockForUpdate(
    [request.fromWalletId, request.toWalletId],
    trx,
  );

  const source = locked.find((wallet) => wallet.id === request.fromWalletId);
  const destination = locked.find((wallet) => wallet.id === request.toWalletId);

  if (!source || !destination) {
    throw new InsufficientFundsError();
  }

  if (source.type !== 'SYSTEM' && source.balance < request.amount) {
    throw new InsufficientFundsError();
  }

  const fromBalanceAfter = source.balance - request.amount;
  const toBalanceAfter = destination.balance + request.amount;

  // Written after the locks are held, not before. Inserting this row takes a
  // FOR KEY SHARE lock on both referenced wallets, and a share lock held by one
  // transaction blocks another transaction's attempt to upgrade to FOR UPDATE,
  // so doing it first makes two concurrent transfers deadlock on each other.
  const transaction = await transactionRepository.insert(
    {
      reference: generateReference(request.type === 'CREDIT' ? 'CRD' : 'TRF'),
      type: request.type,
      from_wallet_id: request.fromWalletId,
      to_wallet_id: request.toWalletId,
      amount: request.amount,
      initiated_by: request.initiatedBy,
      idempotency_key: request.idempotencyKey,
      request_fingerprint: fingerprint,
    },
    trx,
  );

  await walletRepository.updateBalance(source.id, fromBalanceAfter, trx);
  await walletRepository.updateBalance(destination.id, toBalanceAfter, trx);

  await ledgerRepository.insertPair(
    [
      {
        transaction_id: transaction.id,
        wallet_id: source.id,
        direction: 'DEBIT',
        amount: request.amount,
        balance_after: fromBalanceAfter,
      },
      {
        transaction_id: transaction.id,
        wallet_id: destination.id,
        direction: 'CREDIT',
        amount: request.amount,
        balance_after: toBalanceAfter,
      },
    ],
    trx,
  );

  return { transaction, fromBalanceAfter, toBalanceAfter, replayed: false };
}
async function replay(request: MoveRequest, fingerprint: string): Promise<MoveResult> {
  const original = await transactionRepository.findByIdempotencyKey(
    request.initiatedBy,
    request.idempotencyKey,
  );

  if (!original) {
    throw new Error('Idempotency replay could not locate the original transaction');
  }

  if (original.request_fingerprint !== fingerprint) {
    throw new IdempotencyKeyConflictError();
  }

  const entries = await ledgerRepository.findByTransactionId(original.id);
  const debit = entries.find((entry) => entry.direction === 'DEBIT');
  const credit = entries.find((entry) => entry.direction === 'CREDIT');

  return {
    transaction: original,
    fromBalanceAfter: debit?.balance_after ?? 0,
    toBalanceAfter: credit?.balance_after ?? 0,
    replayed: true,
  };
}
export async function sumOfAllBalances(): Promise<number> {
  return ledgerRepository.sumOfAllBalances();
}

export type { WalletRow };
