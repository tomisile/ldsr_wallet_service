import { randomUUID } from 'node:crypto';
import { Express } from 'express';
import request from 'supertest';
import { db } from '../../src/config/knex';
import { move } from '../../src/services/ledger.service';

export interface TestAccount {
  userId: string;
  walletId: string;
  token: string;
  email: string;
}

export async function registerAccount(app: Express, email: string): Promise<TestAccount> {
  const response = await request(app)
    .post('/auth/register')
    .send({ email, password: 'a valid test password', firstName: 'Test', lastName: 'Account' })
    .expect(201);

  const { user, wallet, token } = response.body.data;
  return { userId: user.id, walletId: wallet.id, token, email: user.email };
}

export async function createAdmin(): Promise<string> {
  const [row] = await db('users')
    .insert({
      email: `admin-${randomUUID()}@test.local`,
      password_hash: 'not-used-in-these-tests',
      first_name: 'Test',
      last_name: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    .returning(['id']);

  await db('wallets').insert({ user_id: row.id, type: 'USER', balance: 0 });
  return row.id as string;
}

/**
 * Puts funds into a wallet through the same code path a real credit uses, so
 * test setup cannot accidentally create money outside the ledger and invalidate
 * the zero sum invariant.
 */
export async function fundWallet(
  walletId: string,
  amountMinorUnits: number,
  adminUserId: string,
): Promise<void> {
  const systemWallet = await db('wallets').where({ type: 'SYSTEM' }).first();

  await move({
    fromWalletId: systemWallet.id,
    toWalletId: walletId,
    amount: amountMinorUnits,
    type: 'CREDIT',
    initiatedBy: adminUserId,
    idempotencyKey: `test-funding-${randomUUID()}`,
  });
}

export async function balanceOf(walletId: string): Promise<number> {
  const wallet = await db('wallets').where({ id: walletId }).first();
  return Number(wallet.balance);
}
