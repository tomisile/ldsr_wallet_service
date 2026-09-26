# ldsr Wallet Service

A wallet service handling user accounts and transfers between wallets.

> **Status:** Phase 0. Project skeleton, health check and deployment pipeline.
> Schema, authentication and transfers to follow.

## Stack

Node.js · TypeScript · Express 5 · Knex · PostgreSQL 18 · Jest · Docker

## Environments

| Environment | Database | Triggered by |
| --- | --- | --- |
| Local | Postgres 18 via docker-compose | `npm run dev` |
| CI | Ephemeral Postgres 18 service container | Every push and pull request |
| Production | Render managed Postgres 18 (Frankfurt) | Push to `main` |

One codebase, one set of migrations, three connection strings.

## Running locally

```bash
cp .env.example .env
npm install
npm run db:up        # starts Postgres on :5432
npm run dev          # http://localhost:3000/health
```

Or entirely in containers:

```bash
docker compose --profile full up --build
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm test` | Jest suite (needs Postgres running) |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Local Postgres lifecycle |

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness plus a real database connectivity check |
| POST | `/auth/register` | Create an account and its wallet |
| POST | `/auth/login` | Exchange credentials for an access token |
| GET | `/auth/me` | Report the authenticated caller |

## Deployment pipeline

```
push to main
  └─ CI: lint → build → test (against postgres:18)
       └─ build image, push to Docker Hub as :latest and :<commit-sha>
            └─ POST Render deploy hook
                 └─ Render pulls the image and restarts
```

The image running in production is the image CI built and tested. It is not
rebuilt on the platform. The commit-SHA tag makes every deployed image
permanently identifiable and provides a rollback target.

## Documentation

Detailed design notes live in [`docs/`](docs/README.md):

| Document | Covers |
| --- | --- |
| [Schema](docs/schema.md) | Tables, constraints, money representation, migrations, seeds |
| [Authentication](docs/auth.md) | Registration, login, tokens, authorisation model |
| [Local development](docs/local-development.md) | Running locally, configuration, database commands |

## Design notes

Recorded as they are made; expanded before submission.

- **Environment is validated at startup** (`src/config/env.ts`). A misconfigured
  service refuses to boot rather than failing on the first request that needs a
  missing variable.
- **`app.ts` is separate from `server.ts`** so tests can import the configured
  Express app through supertest without binding a port.
- **`/health` checks the database**, rather than returning a bare 200. A service
  that cannot reach its database is not healthy.
- **SSL is an explicit flag**, not inferred from `NODE_ENV`: Render's external
  connection string requires it, the internal one does not.
- **Money is stored as integer minor units (kobo) in `BIGINT`**, never a float.
- **The database enforces the rules that must never break**: a user wallet
  cannot go negative, a transfer cannot be to itself, an idempotency key cannot
  be reused. See [docs/schema.md](docs/schema.md).
- **Migrations are plain JavaScript** so the same files run in development, CI
  and production without a build step, and they run on deploy as part of the
  container's start command.
