/**
 * Users. `status` drives block/unblock; `role` separates the admin actions
 * (crediting a wallet, blocking a user) from ordinary account holders.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('role', 20).notNullable().defaultTo('USER');
    table.string('status', 20).notNullable().defaultTo('ACTIVE');
    table.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE users
      ADD CONSTRAINT users_role_valid CHECK (role IN ('USER', 'ADMIN')),
      ADD CONSTRAINT users_status_valid CHECK (status IN ('ACTIVE', 'BLOCKED'))
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('users');
};
