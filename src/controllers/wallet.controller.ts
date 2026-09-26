import { Request, Response } from 'express';
import { UnauthorizedError } from '../errors';
import * as userService from '../services/user.service';
import { formatMinorUnits } from '../utils/money';

export async function getOwnWallet(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required');
  }

  const wallet = await userService.getOwnWallet(req.user.id);

  res.status(200).json({
    data: {
      id: wallet.id,
      balance: wallet.balance,
      balanceFormatted: formatMinorUnits(wallet.balance),
      updatedAt: wallet.updated_at,
    },
  });
}
