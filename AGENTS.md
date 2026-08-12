# BichoCoin Engineering Rules

## Mission
BichoCoin is a production-oriented football gaming platform whose MVP includes authentication, an internal BIC wallet/ledger, 24-hour mining sessions, a football quiz, leaderboards, rewards, and administration.

The codebase must remain secure, modular, maintainable, testable, and extensible. New features must not regress existing behavior.

## Mandatory workflow for every task
1. Inspect the repository and relevant docs before editing.
2. Identify affected modules, data models, APIs, tests, and security boundaries.
3. Prefer the smallest correct change.
4. Do not modify unrelated files.
5. Implement tests with the feature.
6. Run lint, typecheck, relevant tests, and build.
7. Report changed files, migrations, risks, and test results.

If a requested change could break existing behavior, explicitly identify the risk and choose the least disruptive design.

## Architecture
- Monorepo with `apps/web` (Next.js) and `apps/api` (NestJS).
- PostgreSQL is the source of truth.
- Prisma is the data access ORM.
- Backend is organized by business domain, not by global controller/service folders.
- Controllers are thin: parse/authorize/request-response only.
- Business rules live in services/use-cases.
- Database access lives in repositories/data-access abstractions when useful.
- Shared code belongs in `common` only when it is genuinely cross-domain.
- Do not create god services or circular dependencies.
- New games must be isolated modules implementing shared game contracts rather than adding large `if/else` or `switch` trees.
- Prefer composition and explicit interfaces over unnecessary inheritance.

## TypeScript and code quality
- Strict TypeScript.
- Avoid `any`; exceptions must be localized and justified.
- No duplicated business rules.
- No magic numbers for business policy; use typed configuration.
- Functions/classes should have one clear responsibility.
- Public APIs and domain rules need descriptive names.
- Comments explain why, not obvious syntax.
- No dead code or commented-out implementation.

## Security baseline
Security decisions should align with OWASP ASVS 5.0.0 and OWASP API Security guidance.

### Trust boundaries
- Never trust client input.
- Frontend validation is UX only; backend validation is authoritative.
- Never trust client-provided balances, scores, rewards, roles, mining times, or transaction states.
- Never authorize by hidden UI alone.

### Authentication
- Passwords must be hashed with Argon2id using current recommended parameters.
- Never store or log plaintext passwords, reset tokens, refresh tokens, secrets, or credentials.
- Use short-lived access tokens and rotatable/revocable refresh sessions.
- Store refresh-token secrets safely (hashed server-side where applicable).
- Support logout of current session and all sessions.
- Password-reset tokens must be single-use, time-limited, and stored safely.
- Authentication endpoints require targeted rate limits and anti-enumeration behavior.

### Authorization
- Enforce RBAC/permissions in backend guards/policies.
- Apply object-level authorization on every resource lookup involving user-controlled IDs.
- Default deny for privileged operations.
- Admin endpoints require explicit authorization and audit logging.

### HTTP/API
- Validate and transform DTOs strictly; reject unknown/unexpected fields where appropriate.
- Configure restrictive CORS per environment.
- Use secure headers and HTTPS in production.
- Limit body size and resource consumption.
- Use consistent non-sensitive errors and request/correlation IDs.
- Never return stack traces or internal SQL/errors to production clients.
- Prevent mass assignment by explicit DTOs/selects.

### Data and secrets
- Secrets never enter source control.
- Use `.env.example` with placeholders only.
- Production secrets belong in the deployment platform secret manager.
- Use least-privilege database credentials.
- Avoid storing sensitive data unless the product requires it.
- Logs must redact sensitive fields.

## Economy / wallet / ledger
- The backend is the only authority for BIC balances.
- No public endpoint may directly set/add/subtract a user's balance.
- Every balance change must correspond to an immutable ledger transaction.
- Financial/economic operations must be atomic database transactions.
- Reward and claim operations must be idempotent.
- Protect against race conditions and double-spend/double-claim behavior.
- Corrections use compensating ledger entries; never rewrite history silently.
- Store enough reference metadata to trace each transaction to its source event.

## Mining
- Mining duration and reward are backend configuration.
- Client countdown is informational only.
- At most one active mining session per user.
- Claim must validate server time and session state.
- Claim must be atomic and idempotent.
- Simultaneous claims must yield one reward only.

## Games and anti-cheat
- Server creates authoritative game sessions.
- Client never submits an authoritative final score.
- Score is derived from validated game events/answers and server rules.
- Questions sent to the client must not reveal correct-answer flags.
- Prevent replay/duplicate completion.
- Reject impossible or invalid session transitions.
- Keep an audit trail sufficient to investigate suspicious scores.

## Leaderboards and rewards
- Rankings derive from validated scores/events, never arbitrary client values.
- Weekly/monthly periods use one documented server timezone strategy.
- Reward definitions are configuration/data, not hardcoded UI logic.
- Reward issuance must be uniquely constrained/idempotent per eligible user-period-position/reward.

## Database
- Use migrations for schema changes.
- Use foreign keys, unique constraints, checks, and indexes to enforce invariants where possible.
- Prefer database guarantees over application-only assumptions for uniqueness/idempotency.
- Review destructive migrations before execution.
- Index based on real query patterns; avoid speculative indexes.
- Use UTC timestamps in persistence unless a documented exception exists.

## Testing
Every business feature requires automated tests proportional to risk.

Critical areas require unit + integration coverage:
- authentication/session rotation
- authorization
- wallet/ledger
- mining concurrency/idempotency
- quiz scoring
- leaderboard aggregation
- reward issuance

Critical user journeys require E2E coverage.

A change is not complete if existing relevant tests fail.

## CI and dependencies
- CI must run lint, typecheck, tests, build, and dependency/security checks.
- Do not disable security checks to make CI pass.
- Add dependencies only when justified.
- Prefer maintained, well-established packages.
- Keep lockfiles committed.

## Git
- Do not push directly to `main`.
- Use focused feature/fix branches.
- Keep commits scoped and descriptive.
- Do not combine unrelated refactors with feature work.

## Documentation
When behavior changes, update the relevant file in `docs/`.
Document:
- business invariants
- API behavior
- schema/migrations
- security decisions
- operational requirements

## Definition of Done
A task is done only when:
- acceptance criteria pass;
- code follows architecture rules;
- backend validation/authorization is present;
- tests are added/updated and passing;
- lint/typecheck/build pass;
- migrations are reviewed;
- documentation is updated;
- no known regression is introduced;
- security implications are checked.
