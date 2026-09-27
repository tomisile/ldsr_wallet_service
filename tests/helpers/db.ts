import { db } from '../../src/config/knex';
export async function resetDatabase(): Promise<void> {
  await db.raw('TRUNCATE ledger_entries, transactions, blacklist RESTART IDENTITY CASCADE');
  await db('wallets').whereNot({ type: 'SYSTEM' }).del();
  await db('users').del();
  await db('wallets').where({ type: 'SYSTEM' }).update({ balance: 0 });
}

export async function ensureSystemWallet(): Promise<string> {
  const existing = await db('wallets').where({ type: 'SYSTEM' }).first();

  if (existing) {
    return existing.id as string;
  }

  const [created] = await db('wallets')
    .insert({ user_id: null, type: 'SYSTEM', balance: 0 })
    .returning(['id']);

  return created.id as string;
}
