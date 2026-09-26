import { Request, Response } from 'express';
import { UnauthorizedError, ValidationError } from '../errors';
import * as creditService from '../services/credit.service';
import * as userService from '../services/user.service';
import { UserRow } from '../repositories/user.repository';
import { presentMovement } from './transfer.controller';

function presentUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    status: user.status,
    updatedAt: user.updated_at,
  };
}

export async function creditWallet(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required');
  }

  if (!req.idempotencyKey) {
    throw new ValidationError('An idempotency-key header is required for this request');
  }

  const result = await creditService.creditWallet({
    initiatorUserId: req.user.id,
    walletId: req.params.walletId as string,
    amount: req.body.amount,
    idempotencyKey: req.idempotencyKey,
  });

  res.status(result.replayed ? 200 : 201).json({ data: presentMovement(result) });
}

export async function blockUser(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required');
  }

  const user = await userService.blockUser(req.user.id, req.params.userId as string);
  res.status(200).json({ data: { user: presentUser(user) } });
}

export async function unblockUser(req: Request, res: Response): Promise<void> {
  const user = await userService.unblockUser(req.params.userId as string);
  res.status(200).json({ data: { user: presentUser(user) } });
}
