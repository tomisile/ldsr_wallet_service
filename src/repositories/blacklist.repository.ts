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

/**
 * The existing accounts whose email appears on the blacklist.
 *
 * An inner join, so it answers "which of our users are blacklisted" rather than
 * "what is on the blacklist". Both columns are stored lowercased, so no
 * normalisation is needed here.
 *
 * Already blocked matches are included, with their status, so an administrator
 * sees what has been handled as well as what still needs a decision.
 */
export async function findBlacklistedUsers(
  trx?: Knex.Transaction,
): Promise<BlacklistedUserRow[]> {
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
