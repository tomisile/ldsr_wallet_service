import { Knex } from 'knex';
import { db } from '../config/knex';
import { UserRole, UserStatus } from '../types/auth';

export type { UserRole, UserStatus };

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface NewUser {
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
}
function table(trx?: Knex.Transaction) {
  return (trx ?? db)<UserRow>('users');
}

export async function findByEmail(email: string, trx?: Knex.Transaction) {
  return table(trx).where({ email }).first();
}

export async function findById(id: string, trx?: Knex.Transaction) {
  return table(trx).where({ id }).first();
}

export async function insert(user: NewUser, trx?: Knex.Transaction): Promise<UserRow> {
  const [row] = await table(trx).insert(user).returning('*');
  return row as UserRow;
}

export async function setStatus(
  id: string,
  status: UserStatus,
  trx?: Knex.Transaction,
): Promise<UserRow | undefined> {
  const [row] = await table(trx)
    .where({ id })
    .update({ status, updated_at: db.fn.now() })
    .returning('*');
  return row as UserRow | undefined;
}
