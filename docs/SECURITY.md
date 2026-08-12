# Security Specification

## Baseline

Use OWASP ASVS 5.0.0 as the verification baseline and OWASP API Security guidance for API-specific risks.

Security is defense in depth. No single middleware/library makes the application secure.

## Sprint 0 controls

The foundation implements the controls that apply before authentication or product endpoints
exist:

- API configuration is validated before listening; required database and CORS values fail closed.
- CORS uses an exact environment allowlist and rejects wildcard configuration.
- API request bodies are size-bounded, DTO validation is allowlist-based, and unknown DTO fields
  are rejected.
- Helmet establishes API security headers. HSTS is enabled only in production, after HTTPS is an
  operational requirement.
- Next.js sets a baseline Content Security Policy, frame protection, MIME-sniffing protection,
  referrer policy, permissions policy, and disables its framework disclosure header.
- API errors use stable safe envelopes and never return a stack trace or raw infrastructure error.
- Each request receives a bounded correlation ID, returned in `X-Request-ID` and response bodies.
- Structured request-completion logs contain timestamp, level, request ID, method, path, status,
  and duration. They deliberately exclude query strings, headers, cookies, bodies, credentials,
  tokens, and connection strings.
- PostgreSQL binds only to the local loopback interface in Docker Compose, and `.env` files and
  generated clients are ignored by Git.
- The lockfile is installed reproducibly in CI. CI checks both the complete dependency tree at
  high severity and the production tree at moderate severity.

These controls do not provide authentication, authorization, abuse throttling, CSRF protection,
or economic/game integrity. Those controls must be added with the endpoint and session designs in
their owning sprints; Sprint 0 does not create placeholder JWT, Argon2, MFA, or RBAC code.

### Known CSP debt

The Sprint 0 Next.js policy currently permits `'unsafe-inline'` for styles and scripts. This
weakens CSP as an XSS mitigation, but removing it now would require a nonce/hash integration that
is disproportionate to the static foundation and could break framework-generated inline content.
Treat this as explicit security debt: reassess the rendered application and migrate to nonces or
hashes before sensitive authenticated UI or a public production release. Do not interpret the
current baseline policy as the final production CSP.

## Threat priorities for BichoCoin

1. Account takeover.
2. Broken object/function authorization.
3. Balance manipulation/double claims.
4. Quiz/score cheating and replay.
5. Admin privilege abuse.
6. Injection/mass assignment/XSS/CSRF depending on auth design.
7. Credential/token leakage.
8. Abuse/resource exhaustion.
9. Supply-chain/dependency vulnerabilities.
10. Sensitive-data leakage in logs/errors.

## Authentication requirements

- Argon2id password hashing.
- Minimum password policy focused on length and compromised/common password resistance; do not impose weak composition theater.
- Rate-limit login, registration, reset, refresh, and other abuse-prone endpoints.
- Generic login/reset responses to reduce account enumeration.
- Short-lived access credentials.
- Rotatable refresh sessions with revocation and reuse-detection design where applicable.
- Password-reset tokens: random, single-use, short-lived.
- Revoke/reset active sessions after sensitive credential changes according to policy.
- MFA is required for privileged/admin accounts before production prize administration.

## Session transport

Prefer secure HttpOnly cookies for browser refresh/session secrets where architecture permits:

- `Secure` in production
- `HttpOnly`
- appropriate `SameSite`
- scoped path/domain

If cookie-based authenticated state-changing requests are used, explicitly evaluate and implement CSRF protection rather than assuming CORS is CSRF protection.

## Authorization

- Backend guard/policy on protected endpoints.
- Object-level checks for user-owned resources.
- Never accept `userId` as authority when identity can come from the authenticated principal.
- Admin routes are deny-by-default and audited.
- Never expose role mutation to normal users.

## Validation and output

- Strict DTO allowlists.
- Reject unexpected properties where practical.
- Normalize/validate identifiers, pagination, enums, lengths, dates, and numeric ranges.
- Encode output appropriately in the web layer; avoid unsafe HTML rendering.
- Prisma parameterization is necessary but does not replace authorization or validation.

## Economic integrity

- Atomic database transaction for ledger + wallet state.
- Unique database constraints for idempotency keys/reference tuples.
- Concurrency tests for mining/reward claims.
- Do not accept client-calculated amounts.
- Never edit historical ledger entries for corrections.
- Audit privileged/manual adjustments.

## Game integrity

- Randomized/opaque session IDs.
- Server-controlled session lifecycle.
- Do not send correct-answer markers.
- Validate answer belongs to the issued question/session.
- Reject duplicate answers/finalization where rules require.
- Score calculation only on server.
- Add reasonable timing/state checks and retain enough event data to investigate anomalies.

## HTTP hardening

- TLS/HTTPS in production.
- HSTS in production after HTTPS is stable.
- Content-Security-Policy appropriate to Next.js application behavior.
- `X-Content-Type-Options: nosniff`.
- frame-ancestor/clickjacking protection.
- restrictive CORS allowlist.
- request/body size limits.
- rate limits with separate policies for sensitive endpoints.
- compression only with awareness of secret-reflection risks.

## Secrets and infrastructure

- No secrets in Git.
- Separate dev/staging/prod configuration.
- Least-privilege DB/app accounts.
- Rotate compromised secrets immediately.
- Production database not publicly exposed.
- Backups and restoration procedure required before valuable rewards/real token integration.

## Logging/audit

Log security-relevant events without secrets:

- login success/failure metadata
- session revocation
- password reset completion
- role/admin changes
- account suspension
- mining/reward claim failures indicating abuse
- manual wallet adjustments

Audit entries should include actor, action, target, timestamp, request/correlation ID, and safe metadata. IP/user-agent handling must respect privacy and retention policy.

## Dependency/security pipeline

- Commit lockfiles.
- Automated dependency audit/SCA in CI.
- Dependabot or equivalent update workflow recommended.
- Secret scanning recommended.
- SAST can be added after foundation, but must not replace review/testing.

## Pre-release security gate

Before public MVP:

- ASVS-driven checklist review.
- authorization tests including IDOR/BOLA attempts.
- concurrency/double-claim tests.
- auth/session abuse tests.
- dependency audit clean or documented exceptions.
- CSP/security headers verification.
- error/log secret-leak review.
- basic web/API penetration test using OWASP WSTG-informed scenarios.
