/**
 * Blacklist, checked at registration.
 *
 * Backed by a local table for this exercise. The service layer accesses it
 * through an interface so that swapping in the Lendsqr Adjutor Karma API is a
 * second implementation rather than a change to the registration flow.
 *
 * Identifiers are stored lowercased; the service normalises before querying.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('blacklist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('identifier', 255).notNullable().unique();
    table.text('reason');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('blacklist');
};
