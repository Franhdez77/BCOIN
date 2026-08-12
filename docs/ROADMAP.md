# MVP Roadmap

## Sprint 0 — Foundation
Repository, web/API bootstrap, PostgreSQL, Prisma, environments, validation foundation, logging/errors, health, Docker, tests, CI.

Exit gate: clean checkout can install, start local stack, lint, typecheck, test, and build.

## Sprint 1 — Authentication
Registration, login, refresh/session rotation, logout, logout-all, password reset, RBAC foundation, auth rate limits.

Security gate: no account enumeration leaks; session revocation and authorization tests pass.

## Sprint 2 — User + Wallet Ledger
Profile, one wallet per user, immutable ledger service, transaction history, admin-safe adjustment foundation (not necessarily exposed yet).

Economic gate: no direct balance mutation outside wallet domain; atomic transaction tests pass.

## Sprint 3 — Mining
Start/current/claim/history, 24-hour policy, one active session, atomic/idempotent claim, concurrency tests.

Economic gate: parallel claims issue exactly one reward.

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
