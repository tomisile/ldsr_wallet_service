const bcrypt = require('bcryptjs');
const EMAIL = 'flagged@ldsr.com';
const REASON = 'Added to the blacklist after onboarding';

exports.seed = async function seed(knex) {
  const existing = await knex('users').where({ email: EMAIL }).first();

  if (existing) {
    console.log(`flagged user already present (${existing.id})`);
  } else {
    const passwordHash = await bcrypt.hash(
      process.env.FLAGGED_USER_PASSWORD || 'flagged_user_password',
      12,
    );

    await knex.transaction(async (trx) => {
      const [user] = await trx('users')
        .insert({
          email: EMAIL,
          password_hash: passwordHash,
          first_name: 'Flagged',
          last_name: 'Afterwards',
          role: 'USER',
          status: 'ACTIVE',
        })
        .returning(['id']);

      await trx('wallets').insert({ user_id: user.id, type: 'USER', balance: 0 });
      console.log(`flagged user created (${user.id}) as ${EMAIL}`);
    });
  }

  await knex('blacklist')
    .insert({ identifier: EMAIL, reason: REASON })
    .onConflict('identifier')
    .ignore();

  console.log(`${EMAIL} is on the blacklist, and holds an active account`);
};
