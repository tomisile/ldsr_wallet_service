import { Request, Response } from 'express';
import { UnauthorizedError, ValidationError } from '../errors';
import { MoveResult } from '../services/ledger.service';
import * as transferService from '../services/transfer.service';
import { formatMinorUnits } from '../utils/money';

/**
 * Amounts are reported in minor units, matching storage, with a formatted string
 * alongside purely for display. The integer is the value; the string is never
 * parsed back.
 */
export function presentMovement(result: MoveResult) {
  const { transaction } = result;

  return {
    reference: transaction.reference,
    type: transaction.type,
    amount: transaction.amount,
    amountFormatted: formatMinorUnits(transaction.amount),
    from: { walletId: transaction.from_wallet_id, balanceAfter: result.fromBalanceAfter },
    to: { walletId: transaction.to_wallet_id, balanceAfter: result.toBalanceAfter },
    createdAt: transaction.created_at,
    replayed: result.replayed,
  };
}

export async function createTransfer(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required');
  }

  if (!req.idempotencyKey) {
    throw new ValidationError('An idempotency-key header is required for this request');
  }

  const result = await transferService.transfer({
    initiatorUserId: req.user.id,
    toWalletId: req.body.toWalletId,
    amount: req.body.amount,
    idempotencyKey: req.idempotencyKey,
  });

  // A replay returns 200 rather than 201: nothing was created this time. The
  // body is identical, so a caller that lost the first response cannot tell the
  // difference in outcome, only in status.
  res.status(result.replayed ? 200 : 201).json({ data: presentMovement(result) });
}
