import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { AuthResult } from '../services/auth.service';

/**
 * Shapes the API representation of an account.
 *
 * Built explicitly rather than by spreading the database row, so that a column
 * added later cannot leak by accident. `password_hash` must never be reachable
 * from here.
 *
 * `balance` is in minor units (kobo), matching storage, so no rounding happens
 * in transit.
 */
function present({ user, wallet, token }: AuthResult) {
  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
    },
    wallet: {
      id: wallet.id,
      balance: wallet.balance,
    },
    token,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  res.status(201).json({ data: present(result) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.status(200).json({ data: present(result) });
}

export async function me(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: { user: req.user } });
}
