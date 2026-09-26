/**
 * Ledger entries: the accounting effect. Exactly two rows per transaction, a
 * DEBIT and a CREDIT of equal amount, so every movement nets to zero.
 *
 * Append-only. The wallet balance is a cache of this table, maintained in the
 * same database transaction; if the two ever diverge, the ledger is the truth
 * and the balance can be rebuilt from it.
 *
 * `balance_after` records the balance of that wallet immediately after the
 * entry, which makes the audit trail readable without replaying the ledger.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('ledger_entries', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('transaction_id').notNullable().references('id').inTable('transactions');
    table.uuid('wallet_id').notNullable().references('id').inTable('wallets');
    table.string('direction', 10).notNullable();
    table.bigInteger('amount').notNullable();
    table.bigInteger('balance_after').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['wallet_id', 'created_at'], 'ledger_entries_wallet_time');
    table.index(['transaction_id'], 'ledger_entries_transaction');
  });

  await knex.raw(`
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_direction_valid CHECK (direction IN ('DEBIT', 'CREDIT')),
      ADD CONSTRAINT ledger_amount_positive CHECK (amount > 0)
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('ledger_entries');
};
