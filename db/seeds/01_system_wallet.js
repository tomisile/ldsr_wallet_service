exports.seed = async function seed(knex) {
  const existing = await knex('wallets').where({ type: 'SYSTEM' }).first();

  if (existing) {
    console.log(`system wallet already present (${existing.id})`);
    return;
  }

  const [wallet] = await knex('wallets')
    .insert({ user_id: null, type: 'SYSTEM', balance: 0 })
    .returning(['id']);

  console.log(`system wallet created (${wallet.id})`);
};
