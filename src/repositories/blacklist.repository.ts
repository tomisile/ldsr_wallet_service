import { Knex } from 'knex';
import { db } from '../config/knex';

export interface BlacklistRow {
  id: string;
  identifier: string;
  reason: string | null;
  created_at: Date;
}

function table(trx?: Knex.Transaction) {
  return (trx ?? db)<BlacklistRow>('blacklist');
}

export async function findByIdentifier(identifier: string, trx?: Knex.Transaction) {
  return table(trx).where({ identifier }).first();
}
