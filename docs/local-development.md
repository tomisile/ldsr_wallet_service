# Local Development

Two ways to run the service locally, and the database commands worth knowing
while testing it.

## Running the service

### Development loop

```bash
cp .env.example .env     # then set JWT_SECRET and ADMIN_PASSWORD
npm install
npm run db:up            # Postgres 18 in a container
npm run migrate
npm run seed             # SYSTEM wallet and one admin
npm run dev              # http://localhost:3000
```

`npm run dev` runs the TypeScript directly and reloads on save, which is what you
want while changing code. It does not run migrations, so run `npm run migrate`
yourself after adding one.

### Production parity

```bash
docker compose --profile full up -d --build
docker compose exec api npm run seed
```

This builds the production image and runs the compiled JavaScript with
`NODE_ENV=production`, migrations executing in the container start command before
the service accepts traffic. Use it to verify a change behaves the same way it
will on the platform, not to iterate, since every code change needs a rebuild.

Both serve on `localhost:3000`, so the same API client configuration works for
either.

For a debugging session with verbose errors inside the container:

```bash
API_NODE_ENV=development docker compose --profile full up -d
```

The variable is deliberately not called `NODE_ENV`: Compose reads `.env` for
interpolation, so `${NODE_ENV:-production}` would silently pick up the
development value from that file and defeat the parity this profile exists for.

### Configuration

Both runtimes read the same `.env`, so a token issued by one verifies against the
other. The compose file overrides only what must differ:

| Variable | Why it is overridden for the container |
| --- | --- |
| `DATABASE_URL` | Inside the compose network the database is `postgres:5432`, not `localhost:5432` |
| `NODE_ENV` | Production by default, to mirror the deployment |

`localhost` inside a container means that container, where nothing listens on
5432. Leaving `DATABASE_URL` pointed at localhost is the most common Docker
networking mistake and shows up as `ECONNREFUSED 127.0.0.1:5432`.

## Where the data lives

Database contents live in the named volume
`ldsr_technical_assessment_postgres_data`, not in the container, so containers can
be rebuilt and replaced freely.

| Command | Effect on data |
| --- | --- |
| `docker compose up -d --build` | intact |
| `docker compose down` | intact |
| `docker compose restart` | intact |
| `docker compose down -v` | **deleted** |

Only `-v` destroys it. For a deliberate clean slate:

```bash
docker compose --profile full down -v
docker compose --profile full up -d --build
docker compose exec api npm run seed
```

Note that `npm test` truncates `users`, `transactions`, `ledger_entries` and
`blacklist` between cases. The schema and the SYSTEM wallet survive, but the
seeded admin does not, so run `npm run seed` again after a test run.

## Connecting to the database

```bash
# Interactive shell; \q to leave
docker compose exec postgres psql -U ldsr -d ldsr

# One-off query
docker compose exec -T postgres psql -U ldsr -d ldsr -c "select * from users"
```

No password is needed, since a connection over the container's local socket is
trusted. Use `-T` for one-off commands and omit it for an interactive shell.

Worth aliasing:

```bash
alias ldb='docker compose exec postgres psql -U ldsr -d ldsr'
alias ldbq='docker compose exec -T postgres psql -U ldsr -d ldsr -c'
```

### Inspecting the schema

| Command | Shows |
| --- | --- |
| `\dt` | All tables |
| `\d users` | Columns, types, indexes and constraints |
| `\d+ wallets` | The same, plus storage detail |
| `\di` | All indexes |
| `\x` | Toggle expanded output, one field per line |
| `\timing` | Report query duration |
| `\q` | Quit |

`\d transactions` prints every `CHECK` constraint on the table, which is the
quickest way to confirm the running schema matches intent.

## Useful queries

Everyone, with their wallet:

```sql
select u.email, u.role, u.status, w.id as wallet_id, w.balance
from users u left join wallets w on w.user_id = u.id
order by u.created_at;
```

All wallets including SYSTEM, which the join above hides because it has no owner:

```sql
select w.type, coalesce(u.email, '(system)') as owner, w.balance
from wallets w left join users u on u.id = w.user_id
order by w.type desc;
```

Confirm passwords are bcrypt at cost factor 12. The prefix encodes the cost:

```sql
select email, substr(password_hash, 1, 7) as bcrypt_prefix, length(password_hash)
from users;
```

Confirm registration is genuinely atomic. This must return no rows, since a user
without a wallet would mean the two writes are not sharing a transaction:

```sql
select u.email from users u
left join wallets w on w.user_id = u.id
where w.id is null;
```

Row counts at a glance:

```sql
select
  (select count(*) from users) as users,
  (select count(*) from wallets) as wallets,
  (select count(*) from blacklist) as blacklisted,
  (select count(*) from transactions) as transactions,
  (select count(*) from ledger_entries) as ledger_entries;
```

## Setting up test conditions

The seed adds three blacklisted identities, so registering any of
`karmaone@ldsr.com`, `karmatwo@ldsr.com` or `karmathree@ldsr.com` returns
`403 BlacklistedUser` without any setup.

To add another, note that identifiers must be lowercase, since the service
normalises before querying:

```sql
insert into blacklist (identifier, reason)
values ('someone@example.com', 'a reason')
on conflict (identifier) do nothing;

delete from blacklist where identifier = 'someone@example.com';   -- undo
```

Block an account, then attempt a login and expect `403 AccountBlocked`:

```sql
update users set status = 'BLOCKED' where email = 'sile@ldsr.com';
update users set status = 'ACTIVE'  where email = 'sile@ldsr.com';   -- undo
```

Clear test accounts while keeping the schema, the SYSTEM wallet and the admin.

`wallets.user_id` is `ON DELETE RESTRICT`, so a user with a wallet cannot be
deleted directly; the rows have to go in dependency order, innermost first. That
restriction is deliberate: a ledger is a financial record, and deleting a user
should never silently destroy the history of money that moved. A real system
closes an account rather than removing it.

```sql
begin;
delete from ledger_entries;
delete from transactions;
delete from wallets where user_id in (select id from users where role = 'USER');
delete from users where role = 'USER';
update wallets set balance = 0;
commit;
```

Run it inside a transaction so a mistake in the middle leaves nothing
half-deleted. Swapping `commit` for `rollback` is a safe way to check the
statements before running them for real.

The alternative is to empty everything and reseed, which is shorter but also
removes the SYSTEM wallet and the admin:

```sql
truncate users, wallets, transactions, ledger_entries restart identity cascade;
```

```bash
docker compose exec api npm run seed
```

`truncate ... cascade` sidesteps the ordering problem by emptying every dependent
table in one statement, which is why the test suite uses it rather than deletes.

## Watching while testing

Application logs, including the correlation id that every response carries in its
`X-Request-Id` header:

```bash
docker compose logs -f api
```

A live view of balances, refreshed every two seconds. Append `\watch` to any
query inside psql:

```sql
select u.email, u.status, w.balance from users u
join wallets w on w.user_id = u.id order by u.created_at \watch 2
```

## Bare output for scripting

```bash
docker compose exec -T postgres psql -U ldsr -d ldsr -q -t -A \
  -c "select count(*) from users"
```

`-q` quiet, `-t` no headers, `-A` unaligned, which makes the result easy to
capture into a shell variable.
