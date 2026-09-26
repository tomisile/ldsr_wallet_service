# Authentication and Authorisation

Two endpoints create and authenticate accounts, one reports who the caller is,
and two middlewares protect everything built on top.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | none | Create an account and its wallet |
| POST | `/auth/login` | none | Exchange credentials for an access token |
| GET | `/auth/me` | Bearer | Report the authenticated caller |

### POST /auth/register

```json
{
  "email": "ada@example.com",
  "password": "correct horse battery",
  "firstName": "Ada",
  "lastName": "Lovelace"
}
```

`201 Created`:

```json
{
  "data": {
    "user": {
      "id": "793fa542-04f3-4b4c-a526-6091bfa79a4e",
      "email": "ada@example.com",
      "firstName": "Ada",
      "lastName": "Lovelace",
      "role": "USER",
      "status": "ACTIVE",
      "createdAt": "2026-09-26T00:55:34.424Z"
    },
    "wallet": { "id": "33bf70fa-ad69-4c22-875a-268f30ddabec", "balance": 0 },
    "token": "eyJhbGciOi..."
  }
}
```

A token is returned on registration so a client does not have to immediately call
login for a credential it has just proved it holds.

`balance` is in minor units (kobo), matching storage, so nothing is rounded in
transit. Formatting into naira is a presentation concern for the caller.

### POST /auth/login

```json
{ "email": "ada@example.com", "password": "correct horse battery" }
```

`200 OK` with the same body shape as registration.

### GET /auth/me

Requires `Authorization: Bearer <token>`. Returns the identity carried by the
token, which is useful for confirming a token is valid and which role it grants.

## Status codes

| Code | Error | When |
| --- | --- | --- |
| 400 | `ValidationError` | Malformed body. Includes per field `details` |
| 401 | `Unauthorized` | Missing, malformed or expired token |
| 401 | `InvalidCredentials` | Wrong email or wrong password |
| 403 | `BlacklistedUser` | The email appears on the blacklist |
| 403 | `AccountBlocked` | The account exists but is blocked |
| 403 | `Forbidden` | Authenticated, but not permitted |
| 409 | `EmailAlreadyRegistered` | The email is already in use |

Every error body has the same shape, and carries the correlation id so a report
of a failure can be traced straight to the log line that produced it:

```json
{
  "error": "InvalidCredentials",
  "message": "Email or password is incorrect",
  "requestId": "fb07f311-c36d-4f3a-b4b0-fb8326d66287"
}
```

## Design decisions

### Registration writes the user and the wallet in one transaction

A user without a wallet cannot transact, so committing one without the other
would leave an account that looks registered but is unusable. Both writes share a
transaction, and either both land or neither does.

### The blacklist is checked before the transaction opens

It is the only step that could become a network call, and an open transaction
must never wait on an external service. Holding a row lock for the duration of
someone else's HTTP timeout is how one slow dependency becomes an outage.

### The blacklist sits behind an interface

`BlacklistService` has a single method. The implementation here reads a local
table; substituting the Lendsqr Adjutor Karma API is a second class satisfying
the same interface plus a change of wiring, not a change to the registration
flow. Tests stub it, so the suite never depends on table state or on a network.

### Passwords are hashed with bcrypt at cost factor 12

Deliberately slow, roughly 250ms per hash, because the purpose of a password hash
is to make offline brute force expensive. The hash is never returned by any
endpoint: responses are built field by field rather than by spreading the
database row, so a column added later cannot leak by accident.

### Login does not reveal whether an email is registered

A wrong password and an unknown email return the identical status, error code and
message. Login also always performs a bcrypt comparison, against a decoy hash
when no user was found, so response time does not leak the difference either. An
endpoint that answers "does this address have an account" faster than it answers
"is this the right password" is an account enumeration oracle.

### Authentication and authorisation are separate middlewares

`authenticate` establishes who the caller is. `requireAdmin` establishes what
they may do. Conflating them tends to produce endpoints that check for a valid
token and forget to check whose resource is being touched, which is how a caller
ends up able to act on somebody else's wallet.

### The token payload carries nothing sensitive

Only a subject, an email and a role. A JWT is signed, not encrypted, so anyone
holding one can read its contents. Expiry is short and configurable through
`JWT_EXPIRES_IN`.

### Validation happens at the boundary, once

`validateBody` parses with a Zod schema and replaces `req.body` with the result,
so services receive typed, trimmed, normalised input and contain no defensive
re-checking. Emails are lowercased and trimmed during validation, so uniqueness,
blacklist lookups and login all agree on what counts as the same address.

Schemas are `.strict()`, so an unknown field is rejected rather than ignored.
Silently dropping a `role` field a caller tried to set is worse than refusing the
request, because the caller believes it took effect.

### Errors are thrown, never handled in controllers

Services throw domain errors; one `errorHandler` maps them to status codes and
the response shape. Express 5 forwards rejected promises from async handlers
automatically, so no controller needs try/catch and no controller decides a
status code. Every status code this API can return is visible in one file.

Unexpected errors are logged in full and reported without internal detail, since
a stack trace or a driver message in a response body is an information
disclosure.

## Test coverage

16 tests, run against a real Postgres.

| Behaviour | Asserted |
| --- | --- |
| Registration creates account, wallet and token | yes |
| Exactly one wallet is created | yes |
| The password hash never appears in a response | yes |
| Duplicate email is rejected regardless of casing | yes |
| A blacklisted identity is refused, and no user row is written | yes |
| Short password returns field level validation detail | yes |
| Unknown fields are rejected, not ignored | yes |
| Login succeeds with correct credentials | yes |
| Wrong password and unknown email are indistinguishable | yes |
| A blocked account cannot log in | yes |
| `/auth/me` rejects missing and malformed tokens | yes |
| `/auth/me` identifies the caller and role for a valid token | yes |
| Every response carries a correlation id | yes |

## Not built

| Omitted | Why |
| --- | --- |
| Refresh tokens | The brief needs authenticated calls, not a session lifecycle |
| Email verification | Not in scope, and it would block the transfer flows being assessed |
| Password reset | Not in scope |
| Lockout after failed attempts | Rate limiting is the proportionate control, and arrives with hardening |
| Roles beyond USER and ADMIN | Two roles cover every action in the brief |
