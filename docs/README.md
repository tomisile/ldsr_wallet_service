# Documentation

Design notes for the wallet service, one document per area. Each explains what
was built, why it was built that way, and what was deliberately left out.

| Document | Covers |
| --- | --- |
| [schema.md](schema.md) | Tables, constraints, types, migrations and seeds |
| [auth.md](auth.md) | Registration, login, tokens, and the authorisation model |
| [transfers.md](transfers.md) | The ledger, row locking, concurrency and idempotency |
| [admin.md](admin.md) | Crediting wallets, blocking accounts, reading a balance |
| [local-development.md](local-development.md) | Running the service locally, and database commands |

Operations, covering the deployment pipeline, monitoring and reconciliation, is
recorded in the main README.
