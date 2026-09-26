/**
 * Transactions: the business event. One row per movement of money.
 *
 * There is deliberately no `status` column. A row is written inside the same
 * database transaction as the balance updates, so if the row exists the money
 * moved and a status could only ever hold one value. A PENDING state becomes
 * necessary only once an external provider is involved, where a timeout leaves
 * the outcome genuinely unknown.
 *
 * `idempotency_key` is unique per initiator. The uniqueness is what provides
 * replay protection: the database rejects a duplicate rather than application
 * code checking first and leaving a gap for a concurrent request to slip
 * through. It is scoped to the initiator so one user cannot consume another's
 * key namespace.
 *
 * `request_fingerprint` is a hash of the request that first used the key. If the
 * same key arrives with a different payload that is a client bug, and returning
 * the original result would silently misreport what happened.
 */
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
