# MVP Roadmap

## Sprint 0 — Foundation
Repository, web/API bootstrap, PostgreSQL, Prisma, environments, validation foundation, logging/errors, health, Docker, tests, CI.

Exit gate: clean checkout can install, start local stack, lint, typecheck, test, and build.

## Sprint 1 — Authentication
Registration and email verification, login, cookie access JWT, opaque refresh rotation/reuse
detection, current/all-session logout, session listing/revocation, password recovery, RBAC
foundation, targeted rate limits, SMTP abstraction, security events, and non-production OpenAPI.

Security gate: Argon2id uses the documented parameters; credentials are cookie-only; unsafe routes
enforce nonce-bound HMAC CSRF plus exact Origin/Fetch Metadata checks; recovery is hash-only,
single-use, expiring, and non-enumerating; rotation/reuse and revocation are covered by focused
tests. The in-memory limiter permits one API replica only.

Product acceptance calls for creating a wallet during registration, but that behavior is
explicitly deferred. Sprint 1 must not create a mutable/unledgered placeholder balance. Sprint 2
adds the wallet and immutable ledger together, backfills Sprint 1 users, then makes future account
and wallet provisioning atomic.

The Next.js UI uses a per-request nonce CSP and dynamic rendering; production permits no
`'unsafe-inline'` or `'unsafe-eval'` script/style execution. Any future static rendering/CDN work
must preserve equivalent nonce, hash, or tested SRI coverage.

## Sprint 2 — User + Wallet Ledger
Authenticated profile read/update with username-only mutation; one exact-integer BIC wallet per
user; migration backfill for Sprint 1 accounts; atomic wallet provisioning for new registrations;
single wallet application service for all balance mutations; immutable/idempotent ledger;
cursor-bounded transaction history; frontend profile/wallet integration; internal-only
admin-adjustment foundation.

Economic gate: no direct balance mutation outside wallet domain; database invariants, concurrency,
idempotency, BOLA/mass-assignment, immutable-history, and atomic transaction tests pass.

## Sprint 3 — Mining
Start/current/claim/history with backend-authoritative 24-hour sessions, explicit 100 BIC configured
reward, per-session reward snapshots, one open session per user, bounded cursor history, and the
minimal `/mining` frontend flow. Claim is atomic with the Sprint 2 wallet ledger and uses a
deterministic source/idempotency identity.

Economic gate: database-backed concurrent starts create one open session; replayed or parallel
claims issue exactly one 100 BIC credit and one `MINING` ledger transaction, with rollback if the
wallet movement fails.

## Sprint 4 — Game Core
Game catalog, generic game-session lifecycle/contracts, extension points for independent game modules.

Architecture gate: adding Quiz does not require hardcoded branching through unrelated domains.

## Sprint 5 — Football Quiz
Categories/questions/answers, admin content management, server-issued sessions, answer validation, score calculation, history/stats.

Anti-cheat gate: correct answers never leak in play API; client cannot set score.

## Sprint 6 — Leaderboards
Global, game, weekly, monthly periods; efficient queries/materialization strategy; own position.

Correctness gate: period boundaries and tie rules documented/tested.

## Sprint 7 — Rewards
Configurable ranking rewards, eligibility, one-time issuance, BIC ledger integration.

Economic gate: duplicate/replayed reward operations cannot double credit.

## Sprint 8 — Admin + Audit
User moderation, quiz content, game status, reward config, audit views. MFA for privileged production accounts.

Authorization gate: BOLA/BFLA tests and audit coverage.

## Sprint 9 — Security/Hardening
ASVS checklist, rate-limit tuning, CSP/headers, dependency/SAST/secret scans, abuse tests, logging/redaction review, performance basics.

## Sprint 10 — Release
E2E, accessibility/responsiveness, deployment config, backups/restore verification, monitoring, bug fixes, release docs.

## Post-MVP candidates
- Manager career game
- Player career game
- Football-player prediction game (not real-money gambling)
- mobile client
- richer achievements/social systems
- scalable workers/cache when metrics justify them
- future real-token integration only after legal, security, custody, economic, and compliance design
