# Postman

`ldsr-wallet-service.postman_collection.json` covers every endpoint, including the
failure cases. 40 requests in 5 folders.

## Setup

Import the collection and both environment files, then pick one from the dropdown.
The collection itself is target agnostic: every request uses `{{baseUrl}}`, so only
the environment changes.

| File | `baseUrl` |
| --- | --- |
| `ldsr-deployed.postman_environment.json` | the deployed service, already filled in |
| `ldsr-local.postman_environment.json` | `http://localhost:3000` |

Set `adminEmail` and `adminPassword` in whichever environment you are using. The
web client cannot reach `localhost`, so the local environment needs the desktop
app.

Put the real password in Postman's **Current value**, not the Initial value. Only
the initial value is included in an export, so the credential stays on your
machine.

Everything else, tokens, identifiers and idempotency keys, are collection
variables written by the request scripts. Nothing needs pasting by hand.

## Idempotency keys

Three requests deliberately have **no** pre-request script, so that they reuse a
key a previous request generated:

| Request | Reuses | Written only by |
| --- | --- | --- |
| Credit wallet A again with the same key | `creditKeyA` | Credit wallet A (admin) |
| Transfer again with the same key | `transferKey` | Transfer A to B |
| [negative] Same key, different amount | `transferKey` | Transfer A to B |

Each key variable is written by exactly one request, so running other requests in
between cannot disturb a replay. Everything else that moves money generates a
throwaway key into `scratchKey`.

## Running

Run the folders in order, and within a folder from top to bottom. Each request's
preconditions are satisfied by the ones above it.

`[negative]` requests assert a specific failure: a named error code, not merely a
non-success status. They are part of the suite rather than leftovers, because what
the service refuses matters as much as what it permits.

Amounts are integer minor units (kobo), so `100000` is 1,000 naira.

## Notes

`Register user A` and `Register user B` return 409 if the accounts already exist,
which is correct. Use the matching login requests instead.

`[negative] Register blacklisted identity` needs the identifier present first:

```sql
insert into blacklist (identifier, reason)
values ('karma@ldsr.com', 'known defaulter') on conflict do nothing;
```

`adminUserId`, used by `[negative] Admin cannot block themselves`, is captured by
`Login admin`, so run that first.

Running the automated test suite truncates the users table, which removes the
seeded admin. Restore it with `docker compose exec api npm run seed`.
