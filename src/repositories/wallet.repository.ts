import { Knex } from 'knex';
import { db } from '../config/knex';

export type WalletType = 'USER' | 'SYSTEM';

export interface WalletRow {
  id: string;
  user_id: string | null;
  type: WalletType;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

function table(trx?: Knex.Transaction) {
  return (trx ?? db)<WalletRow>('wallets');
}

export async function insertForUser(userId: string, trx?: Knex.Transaction): Promise<WalletRow> {
  const [row] = await table(trx)
    .insert({ user_id: userId, type: 'USER', balance: 0 })
    .returning('*');
  return row as WalletRow;
}

export async function findByUserId(userId: string, trx?: Knex.Transaction) {
  return table(trx).where({ user_id: userId }).first();
}

export async function findById(id: string, trx?: Knex.Transaction) {
  return table(trx).where({ id }).first();
}

export async function findSystemWallet(trx?: Knex.Transaction) {
  return table(trx).where({ type: 'SYSTEM' }).first();
}

/**
 * Locks the given wallets for the remainder of the transaction, returning them
 * in ascending id order.
 *
 * Two things matter here.
 *
 * `FOR UPDATE` takes an exclusive row lock, so a second transaction touching the
 * same wallet blocks here until this one commits or rolls back. That is what
 * makes a balance check trustworthy: the value read after the lock cannot change
 * underneath the decision made from it.
 *
 * `ORDER BY id` makes the lock acquisition order deterministic. Without it, a
 * transfer from A to B running concurrently with B to A can each hold the lock
 * the other needs, and deadlock. Ordering means both transactions reach for the
 * same row first, so one simply waits.
 */
export async function lockForUpdate(
  walletIds: string[],
  trx: Knex.Transaction,
): Promise<WalletRow[]> {
  const { rows } = await trx.raw<{ rows: WalletRow[] }>(
    'select * from wallets where id = any(?) order by id for update',
    [walletIds],
  );

  return rows;
}
export async function updateBalance(
  walletId: string,
  balance: number,
  trx: Knex.Transaction,
): Promise<void> {
  await table(trx).where({ id: walletId }).update({ balance, updated_at: db.fn.now() });
}
