import { Knex } from 'knex';
import { db } from '../config/knex';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

export interface LedgerEntryRow {
  id: number;
  transaction_id: string;
  wallet_id: string;
  direction: LedgerDirection;
  amount: number;
  balance_after: number;
  created_at: Date;
}

export interface NewLedgerEntry {
  transaction_id: string;
  wallet_id: string;
  direction: LedgerDirection;
  amount: number;
  balance_after: number;
}

function table(trx?: Knex.Transaction) {
  return (trx ?? db)<LedgerEntryRow>('ledger_entries');
}
export async function insertPair(
  entries: [NewLedgerEntry, NewLedgerEntry],
  trx: Knex.Transaction,
): Promise<void> {
  await table(trx).insert(entries);
}

export async function findByTransactionId(transactionId: string) {
  return table().where({ transaction_id: transactionId }).orderBy('direction');
}

export async function findByWalletId(walletId: string, limit = 50) {
  return table().where({ wallet_id: walletId }).orderBy('created_at', 'desc').limit(limit);
}
export async function sumOfAllBalances(): Promise<number> {
  const result = await db('wallets').sum({ total: 'balance' }).first();
  return Number(result?.total ?? 0);
}
