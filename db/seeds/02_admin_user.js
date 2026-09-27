const bcrypt = require('bcryptjs');
const DEV_DEFAULT_PASSWORD = 'admin_local_password';

exports.seed = async function seed(knex) {
  const email = (process.env.ADMIN_EMAIL || 'admin@ldsr.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || DEV_DEFAULT_PASSWORD;

  if (process.env.NODE_ENV === 'production' && password === DEV_DEFAULT_PASSWORD) {
    throw new Error('ADMIN_PASSWORD must be set explicitly outside development');
  }

  const existing = await knex('users').where({ email }).first();

  if (existing) {
    console.log(`admin already present (${existing.id})`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await knex.transaction(async (trx) => {
    const [user] = await trx('users')
      .insert({
        email,
        password_hash: passwordHash,
        first_name: 'Platform',
        last_name: 'Administrator',
        role: 'ADMIN',
        status: 'ACTIVE',
      })
      .returning(['id']);

    await trx('wallets').insert({ user_id: user.id, type: 'USER', balance: 0 });

    console.log(`admin created (${user.id}) as ${email}`);
  });
};
