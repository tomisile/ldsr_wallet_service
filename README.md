# ldsr Wallet Service

A wallet service handling user accounts and transfers of money between wallets.

**Live:** https://ldsr-wallet-service-latest.onrender.com/health

> Deployed on Render's free tier, which spins the service down after 15 minutes of
> inactivity. The first request after an idle period can take up to 60 seconds
> while it wakes. Subsequent requests are immediate. If the first call appears to
> hang, it is waking rather than broken.

## What it does

| Capability | How |
| --- | --- |
| Account creation | `POST /auth/register` creates a user and their wallet in one transaction |
| Blacklist check | Screened at registration, before the account exists |
| Wallet transfers | `POST /transfers` moves funds between two wallets |
| Funding | `POST /wallets/:id/credit`, administrator only |
| Block and unblock | `POST /users/:id/block` and `/unblock`, administrator only |

Two guarantees the service is built around:

**Balances stay exact under concurrent load.** Twenty simultaneous transfers from
a wallet funded for exactly ten result in exactly ten successes. There is a test
that asserts this.

**A repeated request moves money once.** Every money endpoint requires a client
supplied `Idempotency-Key`, and replay protection is enforced by a database
constraint rather than by application logic.

## Stack

Node.js 22 · TypeScript · Express 5 · Knex · PostgreSQL 18 · Jest · Docker

## Try it in two minutes

No tooling beyond `curl`. Copy the values from each response into the next call.

```bash
BASE=https://ldsr-wallet-service-latest.onrender.com

# 1. Is it up? (first call may take up to 60s on a cold start)
curl -s $BASE/health

# 2. Create an account. The response contains a token and a wallet id.
curl -s -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@example.com","password":"a good password",
       "firstName":"Reviewer","lastName":"One"}'

# 3. Create a second account to transfer to.
curl -s -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer-two@example.com","password":"a good password",
       "firstName":"Reviewer","lastName":"Two"}'

# 4. Read a balance. Zero until funded.
curl -s $BASE/wallets/me -H "Authorization: Bearer $TOKEN_ONE"

# 5. Fund the first wallet. Administrator only, so a normal token gets 403 here.
#    Amounts are in kobo: 100000 is 1,000.00 naira.
curl -s -X POST $BASE/wallets/$WALLET_ONE/credit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Idempotency-Key: 11111111-1111-4111-8111-111111111111' \
  -H 'Content-Type: application/json' \
  -d '{"amount":100000}'

# 6. Transfer 250.00. Note there is no source wallet in the body: it is taken
#    from the token, so a caller cannot move somebody else's money.
curl -s -X POST $BASE/transfers \
  -H "Authorization: Bearer $TOKEN_ONE" \
  -H 'Idempotency-Key: 22222222-2222-4222-8222-222222222222' \
  -H 'Content-Type: application/json' \
  -d "{\"toWalletId\":\"$WALLET_TWO\",\"amount\":25000}"

# 7. Send step 6 again, unchanged. Returns 200 with the same body and
#    "replayed": true. The money moves once.
```

Two things worth trying deliberately:

```bash
# Transfer more than the balance: 422 InsufficientFunds, not a 500
# Reuse the key from step 6 with a different amount: 409 IdempotencyKeyConflict
```

Administrator credentials for the deployed instance are supplied with the
submission rather than committed here.

**Prefer a client?** Import `postman/ldsr-wallet-service.postman_collection.json`
and `postman/ldsr-local.postman_environment.json`. Forty requests covering every
endpoint and its failure cases, each with assertions. Importing a collection file
needs no paid Postman features. See [postman/README.md](postman/README.md).

## Running locally

```bash
cp .env.example .env          # then set JWT_SECRET and ADMIN_PASSWORD
npm install
npm run db:up                 # PostgreSQL 18 in a container
npm run migrate
npm run seed                  # SYSTEM wallet and one administrator
npm run dev                   # http://localhost:3000
```

Or entirely in containers, which runs the production build:

```bash
docker compose --profile full up -d --build
docker compose exec api npm run seed
```

More detail, including the database commands worth knowing, in
[docs/local-development.md](docs/local-development.md).

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | `true` for a managed database reached over the internet |
| `JWT_SECRET` | Signing key, minimum 32 characters |
| `JWT_EXPIRES_IN` | Token lifetime, default `1h` |
| `PORT` | Injected by the platform in production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Read by the seed only, never by the service |

The environment is parsed and validated at startup, so a misconfigured service
refuses to boot rather than failing on the first request that needs a missing
variable.

## API

All amounts are **integer minor units (kobo)**. `100000` is 1,000.00 naira. A
non-integer amount is refused rather than rounded.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness, including a real database check |
| POST | `/auth/register` | none | Create an account and its wallet |
| POST | `/auth/login` | none | Exchange credentials for a token |
| GET | `/auth/me` | Bearer | Report the authenticated caller |
| GET | `/wallets/me` | Bearer | Read the caller's own wallet |
| POST | `/transfers` | Bearer | Move funds to another wallet |
| POST | `/wallets/:walletId/credit` | Bearer, admin | Place funds into a wallet |
| POST | `/users/:userId/block` | Bearer, admin | Block an account |
| POST | `/users/:userId/unblock` | Bearer, admin | Restore an account |

`POST /transfers` and `POST /wallets/:walletId/credit` require an
`Idempotency-Key` header. A request without one is refused.

Every response carries an `X-Request-Id`, echoed in error bodies, so a reported
failure can be traced to the log line that produced it.

### Errors

One shape throughout:

```json
{
  "error": "InsufficientFunds",
  "message": "The source wallet does not have sufficient funds",
  "requestId": "fb07f311-c36d-4f3a-b4b0-fb8326d66287"
}
```

| Code | Meaning |
| --- | --- |
| 400 | Malformed request, or a missing idempotency key |
| 401 | Missing, malformed or expired token |
| 403 | Authenticated but not permitted: not an admin, blocked, blacklisted |
| 404 | No such wallet or user |
| 409 | Email already registered, or an idempotency key reused with a different payload |
| 422 | Valid request, impermissible outcome. Insufficient funds |
| 503 | The SYSTEM wallet is missing, meaning the database has not been seeded |

Insufficient funds is 422 rather than 400 or 500, because the request is well
formed and only the outcome is disallowed.

Per-endpoint reference: [docs/auth.md](docs/auth.md),
[docs/transfers.md](docs/transfers.md), [docs/admin.md](docs/admin.md).

## How correctness is achieved

### Money is never a floating point number

Balances and amounts are `BIGINT` holding integer minor units. Binary floating
point cannot represent decimal fractions exactly, so arithmetic on it drifts.
Formatting into naira happens at the API boundary and is never parsed back.

### The database enforces what must never break

Application code validates for good error messages, but the rules that must hold
regardless are constraints, so a bug in the service layer cannot corrupt a
balance. Twelve of them, each verified by attempting to violate it directly in
`psql`: a user wallet cannot go negative, only one SYSTEM wallet may exist, a
transfer cannot name the same wallet twice, an amount must be positive, an
idempotency key cannot be reused. The full table is in
[docs/schema.md](docs/schema.md).

### The ledger is the truth and the balance is a cache

Every movement writes two `ledger_entries`, a debit and a matching credit of equal
amount, in the same transaction as the balance updates. If a balance ever
diverged from the ledger, the ledger wins and balances can be rebuilt from it.

Funds enter the system through a SYSTEM wallet that belongs to no user, so a
credit has a counterparty rather than being a bare increment. Its negative balance
is exactly the total in circulation, which gives a single assertion covering the
health of the whole ledger:

> **The sum of all balances, including the SYSTEM wallet, is always exactly zero.**

### Concurrency

All money movement passes through one function, so locking and idempotency have a
single implementation rather than one per endpoint. Inside one transaction:

1. `SELECT ... FROM wallets WHERE id = ANY(?) ORDER BY id FOR UPDATE`
2. Read balances from the locked rows, and check sufficiency on that read
3. Insert the transaction row
4. Write both balances and both ledger entries

`FOR UPDATE` takes exclusive row locks, which is what makes the balance check
trustworthy: a balance read before the lock is stale by definition. `ORDER BY id`
makes lock acquisition deterministic, preventing the deadlock where a transfer
from A to B and one from B to A each hold the lock the other needs.

Step 3 comes after the locks for a less obvious reason. **Inserting a row with a
foreign key takes a `FOR KEY SHARE` lock on the referenced rows**, and
`transactions` references `wallets` twice. Share locks are mutually compatible, so
with the insert first every concurrent transaction passed that step and then tried
to upgrade to `FOR UPDATE`, conflicting with every other transaction's share lock.
That deadlocked: twenty parallel transfers left one survivor. Reordering fixed it
without adding anything. The test suite is what caught it.

`READ COMMITTED`, Postgres's default, is sufficient. `FOR UPDATE` provides the row
lock and a guaranteed read of the latest committed version, so raising the
isolation level would add serialisation failures to retry for no benefit.

### Idempotency

Replay protection is a unique constraint on `(initiated_by, idempotency_key)`, not
an application level check. A check-then-insert leaves a window for a concurrent
duplicate to slip through; a unique index does not, and a concurrent duplicate
blocks on the index until the first transaction resolves.

The key is client generated, because the point is that a retry carries the same
value. Its real purpose is not the double tapped button but the **lost response**:
the transaction committed and the caller never found out, so the only safe thing
it can do is send the same request again and get the original answer back.

| Situation | Result |
| --- | --- |
| Same key, same payload | 200 with the original result |
| Same key, concurrently | One 201, the rest 200. Money moves once |
| Same key, different payload | 409. A stored request fingerprint catches it |
| Same key, different user | Independent. The constraint is scoped per initiator |
| Key used on a failed request | Released by the rollback, so a retry can succeed |

A key reused with a different payload is rejected rather than answered, because
returning the original result would report that one transfer succeeded when a
different one is what actually happened.

Idempotency is not replay attack protection. A duplicate is the same legitimate
request arriving twice. An adversary resending a captured request is stopped by
authentication, not by a key they could simply change.

### Security

- Passwords hashed with bcrypt at cost factor 12
- Responses built field by field, never by spreading a database row, so
  `password_hash` cannot leak and a column added later cannot leak by accident
- A wrong password and an unknown email return the identical status, code and
  message, and login always performs a bcrypt comparison against a decoy hash when
  no user is found, so neither the body nor the response time can enumerate
  accounts
- The transfer source is derived from the token, so there is no wallet identifier
  in the body to tamper with
- Crediting is administrator only. A user able to credit their own wallet could
  mint money
- Request schemas are strict, so an unknown field is refused rather than silently
  dropped
- Unexpected errors are logged in full and reported without internal detail
- No secrets in the repository. Configuration comes from the environment, and CI
  authenticates to the cloud through OIDC rather than long lived keys

## Tests

```bash
npm run db:up && npm run migrate
npm test
```

**57 tests, run against a real PostgreSQL rather than a mock**, because the
behaviour under test includes row locks, transactions and unique constraints,
none of which a mock can reproduce.

```
PASS tests/transfers.test.ts
PASS tests/admin.test.ts
PASS tests/auth.test.ts
PASS tests/health.test.ts

Tests: 57 passed, 57 total
```

The ones that matter:

| Test | Assertion |
| --- | --- |
| Twenty parallel transfers, wallet funded for exactly ten | Exactly 10 succeed and 10 return 422, source ends at 0, 22 ledger entries |
| Thirty parallel transfers, wallet funded for five | No wallet is ever negative |
| Ten transfers in each direction simultaneously | No deadlocks, no 5xx, balances return to their starting values |
| Twenty five concurrent transfers, then sum every balance | Exactly zero |
| One idempotency key sent ten times in parallel | One 201, nine 200s, one transaction row |
| Same key with a different amount | 409, the original transfer unaffected |
| Key reused after a failure, once funded | Succeeds |
| Credit as an ordinary user | 403, and the balance stays at zero |
| Block, then log in, then attempt a transfer | 403 both times, balance intact |

Run the concurrency group alone:

```bash
npx jest -t 'concurrency' --verbose
```

Test wallets are funded through the same code path a real credit uses, so setting
up a test cannot create money outside the ledger and quietly invalidate the
invariant the tests exist to check.

## Deployment

```
push to main
  └─ CI: lint, build, test against PostgreSQL 18
       └─ build image, push to Docker Hub as :latest and :<commit-sha>
            └─ POST the Render deploy hook
                 └─ Render pulls the image and restarts
```

The image running in production is **the image CI built and tested**, not one
rebuilt on the platform, so what passed the tests is what serves traffic. The
commit-SHA tag makes every deployed image permanently identifiable and gives a
rollback target.

Migrations run in the container's start command, before the service accepts
traffic, so a failed migration stops the deploy rather than serving requests
against a half-migrated schema.

A pull request runs the tests but does not build or deploy. Merging is the act
that ships.

CI authenticates to Docker Hub with an access token and never holds long lived
cloud credentials.

## Operating this in production

What I would want in place if this carried real traffic.

### The four golden signals

| Signal | Measure |
| --- | --- |
| Latency | p95 and p99 on `/transfers`, never the average. An average hides the tail: p50 of 100ms with p99 of 8s means one caller in a hundred is having an awful time |
| Traffic | Transfers and credits per minute |
| Errors | Split by class. Rising 422s mean callers lack funds, which is a product signal. Rising 5xx means the service is broken. They need different responses |
| Saturation | Database connection pool usage, the first resource to exhaust under transfer contention |

### Alarms on symptoms, not causes

5xx rate above a threshold. p95 latency breaching its objective. Healthy instance
count dropping. Connection pool near its ceiling. Not "CPU above 80 percent",
because high CPU with happy callers is not an incident, and an alarm nobody acts
on trains people to ignore alarms.

### Reconciliation

The domain specific one, and the most valuable. A scheduled job asserting that:

- The sum of all wallet balances, including SYSTEM, is exactly zero
- Each wallet's balance equals the sum of its ledger entries

Either drifting means money was created or destroyed, and that should page someone
within minutes rather than surface at an audit. The assertion already exists as
`sumOfAllBalances()` and is covered by a test; the job is the same check on a
schedule.

### Deadlock and lock wait monitoring

Postgres exposes `deadlocks` in `pg_stat_database`. Given that a lock ordering
mistake is what the concurrency tests caught during development, a rising deadlock
count is exactly the early warning worth having.

### Also

Structured JSON logs carrying the request id, so one call is traceable end to end.
Alerting on third party dependency health rather than learning about an outage from
customers. An objective stated as a number, for example 99.9 percent of transfers
succeeding within 500ms over 28 days, so "is it healthy" has an answer rather than
an argument.

## Assumptions

The brief left these open. Each was chosen deliberately.

| Assumption | Reasoning |
| --- | --- |
| JWT authentication with two roles | Transfers are dangerous unauthenticated, and blocking is inherently privileged |
| A local blacklist table | The brief requires checking a blacklist, not a particular source. It sits behind an interface, so the Adjutor Karma API is a second implementation and a change of wiring |
| An administrative credit endpoint for funding | The brief covers transfers but not how funds enter. Restricted to administrators, since a user crediting their own wallet could mint money |
| Single currency | A closed single currency system. A currency column plus an equality check per transfer would be cost without a requirement |
| One wallet per account | As implied by the brief. A unique constraint documents it and is trivial to relax |
| A blocked account can neither send nor receive | Blocking one direction would let a balance accumulate that its owner cannot reach |

## Deliberately not built

Restraint is part of the brief, so these are choices rather than omissions.

| Not built | Why |
| --- | --- |
| A `status` column on transactions | The row is written in the same transaction as the balances, so if it exists the money moved. It becomes necessary once an external provider can time out |
| External funding or payouts | Out of scope. It would need a `PENDING` state, an idempotency key sent to the provider, a requery job for unknown outcomes, and settlement reconciliation. A provider call that times out has not failed, it has an unknown outcome, and retrying it without a key charges the customer twice |
| Transaction history and pagination | Not in the brief |
| Blacklist administration endpoints | The brief requires checking the blacklist, not administering it |
| Listing users or wallets | Not in the brief, and an easy place to leak data without filtering |
| Refresh tokens, email verification, password reset | Not needed for the flows under assessment |
| Rate limiting and security headers | Genuinely worth having, and the next thing I would add. Scheduled for 0.2.0 |
| A dependency injection container, CQRS, an event bus | Nine endpoints |

## Documentation

| Document | Covers |
| --- | --- |
| [docs/schema.md](docs/schema.md) | Tables, constraints, money representation, migrations, seeds, entity diagram |
| [docs/auth.md](docs/auth.md) | Registration, login, tokens, the authorisation model |
| [docs/transfers.md](docs/transfers.md) | The ledger, row locking, concurrency, idempotency |
| [docs/admin.md](docs/admin.md) | Crediting wallets, blocking accounts |
| [docs/local-development.md](docs/local-development.md) | Running locally, configuration, database commands |
| [postman/README.md](postman/README.md) | The importable collection and how to run it |
