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
