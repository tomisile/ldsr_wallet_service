# Transfers and the Ledger

One endpoint moves money between wallets. One function moves money at all.

## Endpoint

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/transfers` | Bearer | Move funds from the caller's wallet to another |

### Request

```
POST /transfers
Authorization: Bearer <token>
Idempotency-Key: 8f1c9e42-6b7a-4d58-9a21-3e0d5b6c4e13
```

```json
{ "toWalletId": "176df3df-2f27-4605-86cf-e152ddcc68d3", "amount": 25000 }
```

`amount` is in integer minor units (kobo), so `25000` is 250 naira. A
non-integer is rejected rather than rounded, because silently rounding somebody's
money is worse than refusing the request.

**There is no `fromWalletId`.** The source is derived from the authenticated
caller's wallet. Accepting a source and then verifying ownership would also be
correct, but deriving it means the check cannot be forgotten, and a forgotten
ownership check on a money endpoint is the usual shape of an authorisation bug.
The whole class of error is removed rather than guarded against.

### Response

`201 Created`:

```json
{
  "data": {
    "reference": "TRF_MUIW8HTX_03C8A5528A",
    "type": "TRANSFER",
    "amount": 25000,
    "amountFormatted": "250.00",
    "from": { "walletId": "d29d0335-...", "balanceAfter": 75000 },
    "to": { "walletId": "176df3df-...", "balanceAfter": 25000 },
    "createdAt": "2026-09-26T21:20:15.426Z",
    "replayed": false
  }
}
```

A replayed idempotency key returns the identical body with `replayed: true` and
status `200` rather than `201`, since nothing was created on that call.

`amountFormatted` is for display only and is never parsed back. The integer is
the value.

### Status codes

| Code | Error | When |
| --- | --- | --- |
| 201 | | The transfer was performed |
| 200 | | The idempotency key was replayed; the original result is returned |
| 400 | `ValidationError` | Malformed body, non-integer amount, or a missing idempotency key |
| 400 | `SelfTransfer` | Source and destination are the same wallet |
| 401 | `Unauthorized` | Missing, malformed or expired token |
| 403 | `AccountBlocked` | The caller's account is blocked |
| 403 | `RecipientBlocked` | The recipient's account is blocked |
| 404 | `WalletNotFound` | No such destination wallet, or the SYSTEM wallet |
| 409 | `IdempotencyKeyConflict` | The key was used before with a different payload |
| 422 | `InsufficientFunds` | The request is valid, but the balance will not cover it |

Insufficient funds is 422 rather than 400 or 500: the request is well formed, the
outcome is simply not permitted.

## How a movement works

All money movement goes through one function, `move()` in
`src/services/ledger.service.ts`. Transfers and administrative credits both call
it, so there is a single implementation of locking, idempotency and double entry.
A second implementation would be a second chance to get it wrong.

### Before the transaction

Reject a self transfer. Compute a SHA-256 fingerprint of the request, used to
detect an idempotency key reused with different contents.

Eligibility checks, blocked accounts and wallet existence, happen here too, so a
request destined to fail never takes a row lock.

### Inside the transaction

**1. Lock both wallets.**

```sql
select * from wallets where id = any(?) order by id for update
```

`FOR UPDATE` takes an exclusive row lock, so a second transaction touching either
wallet blocks here until this one commits or rolls back. That is what makes the
balance check trustworthy: the value read after the lock cannot change underneath
the decision taken from it.

`ORDER BY id` makes lock acquisition deterministic. Without it, a transfer from A
to B running at the same time as B to A can each hold the lock the other needs,
and deadlock. Ordering means both transactions reach for the same row first, so
one simply waits its turn.

**2. Read balances from the locked rows and check sufficiency.**

A balance read before acquiring the lock is stale by definition, so the check has
to happen on the post-lock read. The SYSTEM wallet is exempt from the sufficiency
check, since its negative balance represents the total in circulation.

**3. Insert the transaction row.**

This must come after the locks. See [the deadlock](#the-deadlock-that-ordering-alone-did-not-fix)
below, which is the most interesting thing in this file.

The unique constraint on `(initiated_by, idempotency_key)` is what rejects a
replay. Checking for an existing key in application code instead would leave a
window between the check and the insert for a concurrent duplicate to slip
through; a unique index has no such window.

**4. Write both balances and both ledger entries.**

Two entries, a DEBIT against the source and a CREDIT to the destination, of equal
amount and sharing one transaction id. `balance_after` is recorded on each so the
audit trail is readable without replaying the ledger.

Either all four steps commit or none of them do. A crash between the debit and
the credit rolls back the whole thing, including the idempotency row, so the key
is released and the caller may retry.

### After the transaction, catching errors

A **unique violation** (Postgres `23505`) means this key has been used before, so
the original transaction is fetched. If its fingerprint matches, it is returned as
a replay. If the fingerprint differs the request is rejected with 409, because
answering with the original result would report that one transfer succeeded when
a different one is what actually happened.

A **check violation** (`23514`) means the non-negative balance constraint fired.
That can only happen if the service layer has a bug, and the database refused the
write rather than allowing a corrupt balance.

## The deadlock that ordering alone did not fix

The first implementation inserted the transaction row *before* locking the
wallets. Deterministic lock ordering was already in place. Twenty parallel
transfers still failed: one succeeded and the rest died, and the test suite took
103 seconds instead of 13.

The cause is that **inserting a row with a foreign key takes a `FOR KEY SHARE`
lock on the referenced rows.** `transactions` references `wallets` twice, so the
insert quietly took share locks on both wallets. Share locks are compatible with
each other, so every concurrent transaction passed that step. Each then tried to
upgrade to `FOR UPDATE`, which conflicts with every other transaction's share
lock. All of them waiting on each other, and Postgres resolving it by killing
transactions.

The fix was reordering, not adding: acquire the exclusive locks first, and the
later foreign key insert is subsumed by a lock already held. Same four
operations, same transaction, same guarantees, no deadlock.

The general lesson is that **a lock you did not know you were taking is still a
lock**, and acquiring a weak lock before a strong one on the same row is a
deadlock waiting to happen.

## Idempotency

The key is client generated and supplied in an `Idempotency-Key` header. It must
come from the caller, because the entire point is that a retry carries the same
value; a server generated key would differ on every attempt.

A missing key is rejected rather than defaulted, since proceeding without one
silently gives up replay protection on a money endpoint.

Its real purpose is not the double tapped button. It is the **lost response**: the
transaction committed, then the connection died before the caller found out. The
caller cannot know whether the money moved, and the only safe thing it can do is
send the same request again and get the original answer back.

| Situation | Behaviour |
| --- | --- |
| Same key, same payload, sequentially | 200 with the original result |
| Same key, same payload, concurrently | One 201, the rest 200. The unique index serialises them |
| Same key, different payload | 409. The fingerprint does not match |
| Same key, different user | Independent. The constraint is scoped to the initiator |
| Key used on a failed request | Released by the rollback, so a retry can succeed |

That last row is deliberate. A business failure such as insufficient funds should
be retryable, because the caller may fund the wallet and try again. Recording
failed attempts on a separate connection would give an audit trail of them, at
the cost of consuming the key, so a legitimate retry would get back a stale
failure.

Keys are retained alongside the transaction. A production system would apply a
retention window; Stripe uses 24 hours.

### Idempotency is not replay attack protection

The two are often conflated. A duplicate is the same legitimate request arriving
twice, and an idempotency key solves it. A replay attack is an adversary
re-sending a captured request; if they resend it verbatim the key catches it, but
if they change the key it is a new legitimate-looking request. What actually stops
that is authentication: short lived tokens over TLS, and the fact that they would
need the victim's token.

## What the tests prove

| Test | Assertion |
| --- | --- |
| Twenty parallel transfers from a wallet funded for exactly ten | Exactly 10 succeed, 10 return 422, source ends at 0, 22 ledger entries |
| Thirty parallel transfers from a wallet funded for five | No wallet is ever negative |
| Ten transfers each way at the same time | No deadlocks, no 5xx, balances return to their starting values |
| Twenty five concurrent transfers, then sum every balance | Exactly zero |
| Same key twice | 201 then 200, identical reference, one transaction row |
| Same key ten times in parallel | One 201, nine 200s, money moved once |
| Same key with a different amount | 409, the original transfer unaffected |
| Key reused after a failure, once funded | Succeeds |

The first is the whole assessment in one test. More than ten succeeding would
mean money was created. Fewer would mean a lost update wrongly rejected a
transfer that was affordable.

## Out of scope

Funds enter through an administrative credit endpoint. In a real system they
arrive via a payment provider webhook after confirmed settlement, which changes
the model: transfers would need a `PENDING` state, an idempotency key sent *to*
the provider, a requery job to resolve unknown outcomes, and end of day
reconciliation against the provider's settlement report.

A provider call that times out has not failed. It has an unknown outcome, and
retrying it without an idempotency key charges the customer twice. That is where
the real complexity of payments lives, and none of it is needed for movements
inside a single system.
