# BichoCoin MVP

BichoCoin is the first web application in a football-themed digital economy and gaming
ecosystem. The MVP will validate this core loop:

`Register -> Mine BIC -> Play Quiz -> Earn Score -> Rank -> Earn Rewards`

Sprint 0 established the web/API runtime, PostgreSQL/Prisma connectivity, health checks, security
defaults, tests, and CI. Sprint 1 adds authentication and account recovery. Wallet creation is
deliberately deferred to Sprint 2 so the first balance is created atomically with the immutable
ledger rather than through a temporary balance implementation. Mining, games, rankings, rewards,
and administration remain future work.

## Architecture

- `apps/web`: Next.js App Router, React, strict TypeScript, and Tailwind CSS.
- `apps/api`: NestJS modular monolith, strict TypeScript, Prisma, and PostgreSQL.
- PostgreSQL 18.4 runs locally through Docker Compose.
- npm workspaces and one root lockfile manage both applications.
- GitHub Actions runs formatting, lint, typecheck, tests, builds, Prisma validation, and dependency
  audits.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the dependency boundaries and
[docs/SECURITY.md](docs/SECURITY.md) for the security baseline.

## Prerequisites

- Node.js 24.19.x LTS and npm 11.17.x (`.nvmrc` is provided).
- Docker Engine with Docker Compose.

Verify the runtime before installing dependencies:

```bash
node --version
npm --version
```

If the versions differ, align the machine without weakening the repository's `engines` policy.
On Windows with the official Node.js LTS package installed through WinGet, run:

```powershell
winget upgrade --id OpenJS.NodeJS.LTS --exact --version 24.19.0 --source winget
```

Alternatively, with a Node version manager already installed, run:

```bash
nvm install 24.19.0
nvm use 24.19.0
npm install --global npm@11.17.0
node --version
npm --version
```

The expected output is Node `v24.19.0` and npm `11.17.0`. The current shell must be restarted if
its executable path still points to a previously installed Node version. The repository enables
`engine-strict`, so dependency installation fails rather than silently accepting an unsupported
runtime.

## Local setup

1. Create the untracked local environment file:

   ```bash
   cp .env.example .env
   ```

   In PowerShell, use `Copy-Item .env.example .env`.

2. Replace the local PostgreSQL password in both `POSTGRES_PASSWORD` and `DATABASE_URL`. URL-encode
   the password inside `DATABASE_URL` if it contains reserved URL characters.

3. Install the exact dependency graph:

   ```bash
   npm ci
   ```

4. Start PostgreSQL and wait for it to become healthy:

   ```bash
   docker compose up -d
   docker compose ps
   ```

5. Apply the reviewed migrations, validate Prisma, and start both applications:

   ```bash
   npm exec --workspace=apps/api -- prisma migrate deploy
   npm run prisma:validate
   npm run dev
   ```

For local email verification and password-recovery testing, start the optional loopback-only
Mailpit service:

```bash
docker compose --profile email up -d
```

Mailpit accepts SMTP on `127.0.0.1:1025` and exposes its local inbox UI at
`http://127.0.0.1:8025`. The default `docker compose up -d` command still starts PostgreSQL only.

The web application is available at `http://localhost:3000`. The root development scripts load
the untracked `.env` before Next.js starts, so its standard `PORT` variable is effective. The API
listens on `API_PORT=3001` by default. Its technical endpoints are:

- `GET http://localhost:3001/health`
- `GET http://localhost:3001/health/live`
- `GET http://localhost:3001/health/ready`

`/health/live` checks only the API process. `/health` and `/health/ready` also check PostgreSQL and
return `503` while the database is unavailable.

Run each application separately with `npm run dev:web` or `npm run dev:api`. Stop the local
services with `docker compose down`; the PostgreSQL named volume remains intact.

> On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd` for the same commands or
> configure an appropriate user execution policy.

## Environment variables

`.env` and all environment-specific variants are ignored by Git. `.env.example` contains only
local placeholders.

| Variable                                                             | Purpose                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                                           | Runtime mode: `development`, `test`, or `production`.                             |
| `PORT`                                                               | Next.js HTTP port, loaded before the development server starts.                   |
| `API_PORT`                                                           | NestJS HTTP port.                                                                 |
| `CORS_ALLOWED_ORIGINS`                                               | Comma-separated exact browser origins; wildcards are rejected.                    |
| `NEXT_PUBLIC_API_BASE_URL`                                           | Public API origin embedded in the web bundle. Never place a secret here.          |
| `WEB_APP_BASE_URL`                                                   | Trusted web origin used for Origin checks and account-action links.               |
| `DATABASE_URL`                                                       | PostgreSQL connection used by Prisma at runtime.                                  |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Local Compose database configuration.                                             |
| `RUN_DATABASE_TESTS`, `AUTH_TEST_DATABASE_URL`                       | Opt into real auth tests against a dedicated loopback database ending in `_test`. |
| `JWT_SIGNING_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`                   | Access-token signing and claim validation.                                        |
| `*_TTL_SECONDS`                                                      | Access, refresh, verification, and reset lifetimes.                               |
| `CSRF_HMAC_SECRET`, `RATE_LIMIT_HMAC_SECRET`                         | Independent HMAC keys; generate distinct random production values.                |
| `AUTH_*_COOKIE_NAME`, `COOKIE_SECURE`                                | Host-only authentication-cookie names and production transport policy.            |
| `AUTH_*_RATE_LIMIT_*`                                                | Per-operation authentication abuse limits.                                        |
| `SMTP_*`                                                             | Account-email transport; production requires implicit TLS or required STARTTLS.   |
| `OPENAPI_ENABLED`                                                    | Enables non-production API documentation when explicitly set to `true`.           |

The API validates required runtime configuration and fails before listening when it is missing or
invalid. Production configuration belongs in the deployment platform's secret manager, not in
repository files.

To resolve local port conflicts, edit only the ignored `.env`:

- Change `PORT` and keep `CORS_ALLOWED_ORIGINS` aligned with the resulting web origin.
- Change `API_PORT` and keep `NEXT_PUBLIC_API_BASE_URL` aligned with the resulting API origin.
- Change `POSTGRES_PORT` and update the port inside `DATABASE_URL` to match.

Do not edit `.env.example` for machine-specific conflicts. It intentionally retains the
conventional ports 3000, 3001, and 5432.

## Quality commands

Run from the repository root:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run audit
docker compose --env-file .env.example config
```

The normal test suite does not require a database. Real authentication tests are destructive only
inside their dedicated database. Create the local target once, set `AUTH_TEST_DATABASE_URL` to its
loopback URL (using the same local-only credentials), and keep it different from `DATABASE_URL`:

```bash
docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" bichocoin_auth_test'
```

The target name must end in `_test`; the suite verifies the connected database and fails closed
before cleanup otherwise. Then execute it exactly as CI does:

```bash
npm run test:database --workspace=apps/api
```

## MVP scope

See [docs/API.md](docs/API.md) for the exact Sprint 1 authentication routes and
[docs/SECURITY.md](docs/SECURITY.md) for cookie, CSRF, rotation, and recovery rules. Planned later
sprints include user profiles, the internal BIC wallet and immutable ledger, 24-hour mining
sessions, the football quiz, leaderboards, rewards, administration, and broader audit tooling. A
real blockchain/token, crypto transfers, betting, mobile apps, and speculative distributed
infrastructure remain out of scope.

Read `AGENTS.md` and `CODEX_FIRST_TASK.md` before changing the implementation.
