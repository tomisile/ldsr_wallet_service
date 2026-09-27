exports.up = async function up(knex) {
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('reference', 64).notNullable().unique();
    table.string('type', 20).notNullable();
    table.uuid('from_wallet_id').notNullable().references('id').inTable('wallets');
    table.uuid('to_wallet_id').notNullable().references('id').inTable('wallets');
    table.bigInteger('amount').notNullable();
    table.uuid('initiated_by').notNullable().references('id').inTable('users');
    table.string('idempotency_key', 255).notNullable();
    table.string('request_fingerprint', 64).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['initiated_by', 'idempotency_key'], { indexName: 'transactions_idempotency' });
    table.index(['from_wallet_id'], 'transactions_from_wallet');
    table.index(['to_wallet_id'], 'transactions_to_wallet');
  });

  await knex.raw(`
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_type_valid CHECK (type IN ('TRANSFER', 'CREDIT')),
      ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0),
      ADD CONSTRAINT transactions_no_self_transfer CHECK (from_wallet_id <> to_wallet_id)
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('transactions');
};
