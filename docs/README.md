# Documentation

Design notes for the wallet service, one document per area. Each explains what
was built, why it was built that way, and what was deliberately left out.

| Document | Covers |
| --- | --- |
| [schema.md](schema.md) | Tables, constraints, types, migrations and seeds |
| [auth.md](auth.md) | Registration, login, tokens, and the authorisation model |
| [local-development.md](local-development.md) | Running the service locally, and database commands |

Planned as the corresponding phases land: the transfer ledger and concurrency
control, and operations covering the deployment pipeline, monitoring and
reconciliation.
