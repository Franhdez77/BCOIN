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

Mailpit is an optional development-only SMTP capture service under the Compose `email` profile.
Both its SMTP and browser ports bind to loopback. It is not part of the default stack and is not a
production mail-delivery dependency.

## Sprint 1 authentication slice

Sprint 1 introduces the `auth` domain and its persistence models without introducing wallet or
economy writes. Controllers remain transport-only; authentication policy, session rotation,
credential recovery, email verification, and abuse controls live behind the auth service
boundary. Email delivery is an SMTP adapter so the domain does not depend on Mailpit or a vendor.

Browser authentication uses a short-lived access JWT in an HttpOnly cookie and a random opaque
refresh secret in a separate HttpOnly cookie. Only a hash of each refresh secret is persisted.
Rotation advances a token chain inside one session family; reuse of a consumed token revokes that
family. Logout revokes the current family, logout-all revokes every family for the user, and a
successful password reset revokes every existing session for the account.

The access, refresh, and CSRF cookies are host-only (no `Domain`), use `SameSite=Strict`, and are
`Secure` in production. Paths follow least privilege: access and CSRF use `/api/v1`; refresh uses
`/api/v1/auth`. This assumes the web and API are served over HTTPS on the same registrable site;
localhost ports remain same-site for development. Exact CORS and Origin validation still apply.
Do not deploy the API on a cross-site origin or place untrusted applications on sibling subdomains
without redesigning the cookie and CSRF topology.

Unsafe requests require `X-CSRF-Token`. `GET /api/v1/auth/csrf` creates an HttpOnly nonce cookie
and returns an HMAC token bound to that nonce. The nonce rotates with authentication, and the new
token can be returned by login or refresh. This is intentionally not a JavaScript-readable
double-submit cookie.

Targeted auth limits are process-local for Sprint 1. This is acceptable only while the API runs as
one replica; counters reset on restart and cannot coordinate across replicas. A shared limiter
store is required before horizontal scaling. HMAC-derived subjects avoid retaining raw account
identifiers as limiter keys.

## Sprint 2 user and economy slice

Sprint 2 adds independent `users` and `wallet` modules. `users` owns safe profile behavior and
account provisioning; `wallet` owns wallet creation, balance mutation, immutable ledger writes,
and wallet/history queries.

Registration keeps one transaction boundary:

```text
auth registration
  -> UserProvisioningService
       -> create User
       -> WalletProvisioningService
            -> create zero-balance Wallet
```

Authentication does not write ledger rows and does not manipulate `wallet.balance`. Future Mining,
Rewards, and administrative adjustment flows must call `WalletApplicationService.recordMovement`
instead of writing the wallet table directly.

Serializable PostgreSQL transactions with bounded retry protect concurrent balance changes.
Idempotency is additionally enforced by unique database keys. The web layer receives BIC values as
decimal strings, treats them as display state only, and never persists an authoritative balance in
browser storage.

## Sprint 3 mining slice

Sprint 3 adds an isolated `mining` module with thin HTTP presentation, a command-side
`MiningApplicationService`, and a query-side `MiningQueryService`. PostgreSQL stores one open
session (`claimedAt IS NULL`) per user through a partial unique index. Session duration and reward
come from validated backend configuration; `rewardAmount` is snapshotted when the session starts.

A claim owns the outer serializable transaction. It conditionally transitions the session to
claimed and calls `WalletApplicationService.recordMovementInTransaction` using that same Prisma
transaction. The wallet service remains the only balance-mutation boundary; Mining never updates
`wallet.balance` or inserts a ledger row directly. Deterministic idempotency plus the unique
`MINING` source reference form an independent database backstop against replay/double credit.

The web integration lives at `/mining`. Its countdown is display-only and never enables a claim on
client time alone; eligibility is refreshed from the API. All public ownership comes from the live
authenticated principal.

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

Before adding a second API replica, replace the Sprint 1 in-memory rate-limit store with a shared,
fail-safe implementation and retest rotation/reuse races. SMTP can move from Mailpit to a managed
provider without changing auth-domain contracts.
