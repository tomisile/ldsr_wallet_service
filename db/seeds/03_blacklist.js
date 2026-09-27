const BLACKLISTED = [
  { identifier: 'karmaone@ldsr.com', reason: 'Defaulted on a prior facility' },
  { identifier: 'karmatwo@ldsr.com', reason: 'Identity could not be verified' },
  { identifier: 'karmathree@ldsr.com', reason: 'Reported for fraudulent activity' },
];

exports.seed = async function seed(knex) {
  const inserted = await knex('blacklist')
    .insert(BLACKLISTED)
    .onConflict('identifier')
    .ignore()
    .returning(['identifier']);

  const total = await knex('blacklist').count('* as count').first();

  console.log(`blacklist: ${inserted.length} added, ${total.count} identifiers in total`);
};
