import { Knex } from 'knex';
import { db } from '../config/knex';

export type TransactionType = 'TRANSFER' | 'CREDIT';

export interface TransactionRow {
  id: string;
  reference: string;
  type: TransactionType;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  initiated_by: string;
  idempotency_key: string;
  request_fingerprint: string;
  created_at: Date;
}

export interface NewTransaction {
  reference: string;
  type: TransactionType;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  initiated_by: string;
  idempotency_key: string;
  request_fingerprint: string;
}

function table(trx?: Knex.Transaction) {
  return (trx ?? db)<TransactionRow>('transactions');
}

export async function insert(
  transaction: NewTransaction,
  trx: Knex.Transaction,
): Promise<TransactionRow> {
  const [row] = await table(trx).insert(transaction).returning('*');
  return row as TransactionRow;
}

/** Used to return the original result when an idempotency key is replayed. */
export async function findByIdempotencyKey(initiatedBy: string, idempotencyKey: string) {
  return table().where({ initiated_by: initiatedBy, idempotency_key: idempotencyKey }).first();
}

export async function findByReference(reference: string) {
  return table().where({ reference }).first();
}
