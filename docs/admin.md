# Administrative Endpoints and Wallet Access

Funding a wallet and blocking an account are privileged operations. One endpoint
lets a caller read their own balance.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/wallets/:walletId/credit` | Bearer, **admin** | Place funds into a wallet |
| POST | `/users/:userId/block` | Bearer, **admin** | Block an account |
| POST | `/users/:userId/unblock` | Bearer, **admin** | Restore a blocked account |
| GET | `/users/blacklisted` | Bearer, **admin** | Report existing accounts that appear on the blacklist |
| GET | `/wallets/me` | Bearer | Read the caller's own wallet |

## POST /wallets/:walletId/credit

```
Idempotency-Key: 8f1c9e42-6b7a-4d58-9a21-3e0d5b6c4e13
```

```json
{ "amount": 50000 }
```

Returns the same body shape as a transfer, with `type: "CREDIT"`.

### Why it is administrator only

Bluntly: **a user able to credit their own wallet can mint money.** This is the
single most damaging bug the service could ship, so the privilege boundary is the
substance of the endpoint rather than a formality. A test asserts that an ordinary
caller receives 403 and that the target balance remains zero.

### Why it is a transfer, not a balance increment

The credit is modelled as a movement out of the SYSTEM wallet. Three consequences:

- Every ledger entry has a counterparty, so double entry holds and the sum of all
  balances stays exactly zero
- The SYSTEM wallet's negative balance is precisely the total in circulation
- Funding reuses the same locking, idempotency and validation as an ordinary
  transfer, rather than reimplementing them

The SYSTEM wallet cannot be credited, and returns 404 if named. It is not
addressable by any caller.

### Status codes

| Code | Error | When |
| --- | --- | --- |
| 201 | | Funds were credited |
| 200 | | The idempotency key was replayed |
| 400 | `ValidationError` | Malformed amount, malformed wallet id, or missing idempotency key |
| 401 | `Unauthorized` | Missing or invalid token |
| 403 | `Forbidden` | The caller is not an administrator |
| 404 | `WalletNotFound` | No such wallet, or the SYSTEM wallet |
| 409 | `IdempotencyKeyConflict` | The key was used before with a different payload |
| 503 | `SystemWalletNotConfigured` | The database has not been seeded |

That last one is deliberate. A missing SYSTEM wallet is an environment fault
rather than a caller mistake, so it reports as a service problem and points at the
cause.

## POST /users/:userId/block and /unblock

No request body. Both return the updated account.

### Blocking stops funds in both directions

A blocked account cannot log in, cannot send funds, and cannot receive them.
Blocking in one direction only would let a balance accumulate that its owner has
no way to reach.

### Blocking is idempotent

Blocking an already blocked account returns 200 with the same state rather than an
error. The caller is expressing a desired state, not requesting a state
transition, so repeating it is not a mistake. The same applies to unblocking an
active account.

### An administrator cannot block their own account

They would have no way to log in and undo it. The check is explicit rather than
relying on an administrator being careful.

### Blocking is an access control change, not a financial one

A blocked account keeps its balance. Nothing is confiscated, no ledger entry is
written, and the zero sum invariant is untouched. There is a test for exactly
this, because the alternative, quietly zeroing a balance, would be a serious bug
dressed up as a feature.

Note also that a user is blocked, never deleted. `wallets.user_id` is
`ON DELETE RESTRICT`, so the database refuses to remove a user who holds a wallet.
A ledger is a financial record, and deleting a user should never silently destroy
the history of money that moved.

### Status codes

| Code | Error | When |
| --- | --- | --- |
| 200 | | The account is in the requested state |
| 400 | `ValidationError` | Malformed user id |
| 401 | `Unauthorized` | Missing or invalid token |
| 403 | `Forbidden` | The caller is not an administrator, or is targeting themselves |
| 404 | `UserNotFound` | No such user |

## GET /users/blacklisted

```json
{
  "data": {
    "count": 1,
    "matches": [
      {
        "userId": "ef47e236-cced-45e6-a991-07be12ff8c13",
        "email": "flagged@ldsr.com",
        "status": "ACTIVE",
        "reason": "Added to the blacklist after onboarding",
        "blacklistedAt": "2026-09-27T15:36:42.032Z"
      }
    ]
  }
}
```

### Why this exists

Screening at registration only catches an identity that is already on the list. A
blacklist changes, so an account that was clean when it was opened can appear on one
later. This is how that is found.

### It reports, it does not act

The endpoint returns matches. Blocking remains an explicit decision through
`POST /users/:userId/block`.

Two reasons. There is then exactly one code path that blocks an account, and one
audit entry per decision. And an endpoint that froze accounts in bulk as a side
effect is not something anyone could undo confidently.

### Which of our users are blacklisted, not what is on the blacklist

An inner join between `users.email` and `blacklist.identifier`. Both columns are
stored lowercased, so no normalisation happens here.

A blacklisted identity that never registered does not appear, because it is not a
user. There is no endpoint that lists the blacklist itself: that list is owned by the
external provider, and exposing or administering it here would claim an authority
this service does not have.

An empty result is `200` with `count: 0`, not `404`. A valid query with no matches is
a successful query.

### Already blocked matches are included

With their `status`, so an administrator sees what has been handled as well as what
still needs a decision, rather than a list that silently shrinks as they work through
it.

### Not paginated

The result is bounded by the size of the blacklist. A production implementation would
paginate, and would screen against the provider's API per user on a schedule rather
than joining a local table.

### Status codes

| Code | Error | When |
| --- | --- | --- |
| 200 | | Zero or more matches |
| 401 | `Unauthorized` | Missing or invalid token |
| 403 | `Forbidden` | The caller is not an administrator |

## GET /wallets/me

```json
{
  "data": {
    "id": "d29d0335-cfaf-46d6-a13f-aaabe37326f5",
    "balance": 123456,
    "balanceFormatted": "1,234.56",
    "updatedAt": "2026-09-26T21:20:15.426Z"
  }
}
```

`balance` is in minor units and is the value. `balanceFormatted` exists for
display and is never parsed back.

This endpoint is not required by the brief. It is included because a caller needs
some way to see their own balance, and it reads only the authenticated user's
wallet, so there is no identifier to tamper with.

## What the tests prove

| Test | Assertion |
| --- | --- |
| Credit a wallet | Balance rises, SYSTEM goes negative by the same amount |
| Credit, then sum all balances | Exactly zero |
| Credit as an ordinary user | 403, and the balance stays at zero |
| Credit with no idempotency key | 400 |
| Credit twice with one key | Credited once |
| Credit the SYSTEM wallet | 404 |
| Block, then log in | 403 `AccountBlocked` |
| Block, then attempt a transfer | 403, and the balance is unchanged |
| Block twice | 200 both times, still blocked |
| Block as an ordinary user | 403, and the target stays ACTIVE |
| Administrator blocks themselves | 403 |
| Block an unknown user | 404 `UserNotFound` |
| Block an account holding funds | Balance intact, zero sum invariant holds |
| Read own wallet | Correct balance and formatting |
| Screen with nobody blacklisted | 200, `count: 0` |
| Screen after an existing account is blacklisted | Reports it with its reason |
| Screen excludes users who are not blacklisted | Only the match is returned |
| Screen excludes blacklisted identities that never registered | Not users, so not reported |
| Screen after blocking a match | Still reported, status now `BLOCKED` |
| Screen as an ordinary user | 403 |

## Not built

| Omitted | Why |
| --- | --- |
| Blacklist management endpoints | The blacklist is owned by the external provider. Adding or removing entries here would claim an authority this service does not have |
| A bulk block action | One decision per account keeps the audit trail meaningful and reuses the single blocking code path |
| Debiting or reversing a wallet | Not in the brief. A correction in a real ledger is a compensating entry, never a deletion |
| Listing users or wallets | Not in the brief, and it is an obvious place to leak data without pagination and filtering |
| Roles beyond USER and ADMIN | Two roles cover every action in the brief |
