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

export interface BlacklistedUserRow {
  user_id: string;
  email: string;
  status: string;
  reason: string | null;
  blacklisted_at: Date;
}
export async function findBlacklistedUsers(trx?: Knex.Transaction): Promise<BlacklistedUserRow[]> {
  return (trx ?? db)('users')
    .join('blacklist', 'blacklist.identifier', '=', 'users.email')
    .select(
      'users.id as user_id',
      'users.email',
      'users.status',
      'blacklist.reason',
      'blacklist.created_at as blacklisted_at',
    )
    .orderBy('users.created_at', 'asc');
}
