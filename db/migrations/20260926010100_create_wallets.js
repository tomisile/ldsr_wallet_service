/**
 * Wallets.
 *
 * Balances are stored as integer minor units (kobo) in a BIGINT. Money is
 * never held in a floating point type: binary floats cannot represent decimal
 * fractions exactly, so arithmetic on them drifts.
 *
 * `user_id` is nullable and unique: exactly one wallet per user, and the single
 * SYSTEM wallet belongs to no user. The SYSTEM wallet is the counterparty that
 * lets funds enter the closed system while keeping double-entry intact, so it
 * is the only wallet permitted a negative balance.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').unique().references('id').inTable('users').onDelete('RESTRICT');
    table.string('type', 20).notNullable().defaultTo('USER');
    table.bigInteger('balance').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_type_valid CHECK (type IN ('USER', 'SYSTEM')),
      ADD CONSTRAINT wallets_user_required CHECK (
        (type = 'SYSTEM' AND user_id IS NULL) OR (type = 'USER' AND user_id IS NOT NULL)
      ),
      ADD CONSTRAINT user_wallet_never_negative CHECK (type = 'SYSTEM' OR balance >= 0)
  `);

  // One SYSTEM wallet only.
  await knex.raw(`
    CREATE UNIQUE INDEX wallets_one_system_wallet
      ON wallets ((type)) WHERE type = 'SYSTEM'
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('wallets');
};
