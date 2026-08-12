# Architecture

## Style

Use a modular monolith for the MVP.

This gives strong domain boundaries without premature distributed-system complexity. The architecture must permit later extraction of modules/services if scale or organizational needs justify it.

## Topology

```text
Browser
  |
  v
Next.js Web (apps/web)
  |
  | HTTPS/JSON
  v
NestJS API (apps/api)
  |
  +--> PostgreSQL via Prisma
  |
  +--> future: object storage / cache / queue only when required
```

## Repository

```text
/
├── apps/
│   ├── web/
│   └── api/
├── docs/
├── .github/workflows/
├── AGENTS.md
├── docker-compose.yml
└── package.json
```

The repository is an npm-workspaces monorepo with one root `package-lock.json`. Root quality
scripts execute the corresponding script in every workspace; persistent development servers are
the only commands run concurrently.

## Sprint 0 implementation

Sprint 0 establishes only technical modules:

```text
apps/api/src/
├── app/                  # composition and reusable HTTP bootstrap
├── config/               # validated environment configuration
├── common/               # request context, errors, logging, validation, envelopes
├── health/               # liveness and PostgreSQL-backed readiness
└── infrastructure/
    └── prisma/           # explicit, non-global database adapter module
```

`apps/web` is a minimal Next.js App Router application. Its public API base URL is configuration,
not a production URL embedded in source. The home page is a technical placeholder and does not
start or model any product journey.

PostgreSQL is the only local infrastructure service. Prisma has an empty product schema and no
migration in Sprint 0; readiness performs a parameter-free `SELECT 1` through Prisma. Redis,
queues, WebSockets, and product-domain modules are intentionally absent.

## HTTP foundation

Future public API controllers live under `/api/v1`. Operational health routes remain outside that
prefix. The application pipeline establishes, in order, a correlation ID, security headers,
bounded body parsing, restrictive CORS, strict DTO validation, predictable success/error
envelopes, and structured completion logs.

The same bootstrap function is used by production and HTTP tests so tests do not bypass global
security or error-handling behavior. Liveness never depends on PostgreSQL; readiness does. This
allows orchestration to distinguish a running process from an instance ready to receive traffic.

## API module target

```text
apps/api/src/
├── app/
├── config/
├── common/
│   ├── authz/
│   ├── errors/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── logging/
│   └── validation/
├── infrastructure/
│   └── prisma/
├── auth/
├── users/
├── wallet/
├── mining/
├── games/
│   ├── core/
│   └── quiz/
├── leaderboards/
├── rewards/
├── admin/
├── audit/
└── health/
```

## Dependency direction

- HTTP/controllers depend on application/domain services.
- Domain services may depend on interfaces/ports.
- Infrastructure implements data-access concerns.
- Domain modules should not import UI or framework-specific concerns unnecessarily.
- `wallet` owns balance mutations.
- `mining`, `rewards`, and games request economic changes through wallet/economy interfaces, never update balances directly.

## Invariants

1. One user has one wallet.
2. Wallet balance changes only through wallet/economy domain logic.
3. Every balance mutation has one immutable ledger entry.
4. One active mining session per user.
5. Mining claim is one-time and atomic.
6. Game score is server-derived.
7. Leaderboards use validated score data.
8. Reward issuance is uniquely identifiable and one-time.
9. Admin actions are authorized and auditable.

## API versioning

Start public API under `/api/v1` to preserve room for incompatible future changes.
Health endpoints may live outside versioning when operationally useful.

## Time

- Store timestamps in UTC.
- Server owns authoritative current time.
- Define ranking timezone in configuration; never derive period boundaries from browser locale.

## Scaling path

Do not implement these until evidence requires them:

- Redis cache
- queues/background workers
- WebSockets
- separate services
- read replicas
- CDN/object storage for user media

When introduced, preserve domain contracts and keep PostgreSQL authoritative for economic state.
