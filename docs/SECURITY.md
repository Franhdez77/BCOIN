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

### Content Security Policy

Sprint 1 closes the foundation's inline-script debt with a cryptographically random nonce on each
rendered document. The Next.js proxy supplies the same nonce-bound CSP to the request renderer and
the browser response, and the root layout is dynamic so a nonce is never reused from static HTML.
Production permits neither `'unsafe-inline'` nor `'unsafe-eval'` for scripts or styles. Development
retains only the framework allowances needed for source evaluation and style injection. This
dynamic-rendering policy trades static HTML/CDN caching for a materially stronger boundary around
the authenticated UI; revisit that trade-off only with equivalent hash/SRI coverage and tests.

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

### Sprint 1 password and token parameters

- Hash passwords with Argon2id version `0x13`, `memoryCost=19456` KiB, `timeCost=2`,
  `parallelism=1`, a cryptographically random 16-byte salt, and a 32-byte hash.
- Calibrate upward on production hardware without weakening those defaults. Use `needsRehash` on
  successful login so future policy upgrades are gradual.
- Run a dummy Argon2 verification for unknown accounts, keep hashing behind targeted rate limits,
  and never log plaintext passwords, reset/verification secrets, refresh secrets, or hashes.
- Access JWTs expire after 600 seconds and validate the configured issuer and audience. They are
  transport credentials only, not a source for mutable role/account state beyond the documented
  claims policy.
- Opaque refresh credentials expire after 2,592,000 seconds. Persist only their hashes; rotate on
  every use and revoke the complete session family when reuse is detected.
- Email-verification credentials expire after 86,400 seconds and password-reset credentials after
  3,600 seconds. They are random, hash-only at rest, single-use, and invalid after consumption,
  revocation, or expiry.
- A successful password reset revokes every existing session and refresh credential for the
  account.

## Session transport

Sprint 1 uses cookies exclusively for browser credentials. The access JWT and opaque refresh
secret are never returned in JSON and must never enter localStorage or sessionStorage. All three
auth cookies are HttpOnly, host-only, `SameSite=Strict`, and `Secure` in production. Access and
CSRF cookies use `Path=/api/v1`; the refresh cookie uses `Path=/api/v1/auth`.

The CSRF cookie contains a random nonce, not a bearer token readable by JavaScript. A client first
calls `GET /api/v1/auth/csrf`, then sends the returned HMAC value in `X-CSRF-Token` on every unsafe
request, including registration, login, email verification/resend, refresh, logout, session
deletion, forgot-password, and reset-password. Login and refresh rotate the nonce and may return a
replacement CSRF token. The server also requires the exact allowed Origin and rejects incompatible
Fetch Metadata. CORS is not treated as CSRF protection.

This strict policy depends on same-site HTTPS deployment of web and API. Do not set a parent
`Domain` attribute, admit wildcard origins, or host untrusted sibling applications on the same
site.

### Targeted authentication limits

The checked-in defaults are login 10 per 600 seconds, registration 5 per 3,600 seconds, refresh
30 per 60 seconds, forgot-password 5 per 3,600 seconds, reset-password 5 per 900 seconds, and
email verification/resend 5 per 3,600 seconds. Responses remain non-enumerating. Sprint 1 stores
counters in memory and therefore supports one API replica only; restart clears counters and
multiple replicas would permit limit bypass. Replace this with a shared store before scaling out.
The current process also treats the direct socket peer as the client IP. Before placing the API
behind a load balancer, configure and test an explicit trusted-proxy/CIDR policy; trusting arbitrary
forwarded headers would permit limiter bypass, while trusting none would collapse all clients into
the proxy address.

### Recovery and email

Email is sent through an SMTP abstraction. Raw verification/reset credentials exist only in the
outgoing link; the database stores a hash. Links derive from the validated `WEB_APP_BASE_URL` and
target the frontend routes `/verify-email` and `/reset-password`. Forgot-password/resend responses
do not reveal whether an account exists. Mailpit is a loopback development capture service, never
a production trust boundary.

Production requires encrypted SMTP transport: either implicit TLS (`SMTP_SECURE=true`) or
mandatory STARTTLS (`SMTP_REQUIRE_TLS=true`). Verification and reset links must never use an
opportunistic plaintext fallback.

Sprint 1 sends synchronously through the email port. Public recovery/resend responses stay generic
even when delivery fails, and logs contain only a safe error type, but processing-time differences
can remain. Before public high-volume release, move delivery to a durable transactional outbox and
worker so availability, retries, and timing do not depend on the SMTP round trip.

### Integration-test isolation

Authentication database tests are destructive only inside their dedicated target. Enabling them
requires an `AUTH_TEST_DATABASE_URL` that differs from `DATABASE_URL`, uses loopback PostgreSQL,
and names a database ending in `_test`; the suite verifies the active database before cleanup and
fails closed otherwise.

### Retention and deployment debt

Sprint 1 does not yet run a retention worker. Before a public production launch, define UTC
retention windows and privacy rules for IP/User-Agent metadata and security events, then add
indexed, bounded-batch cleanup for expired or revoked sessions and consumed, revoked, or expired
refresh/action tokens. Session responses are capped, but the persistent tables otherwise grow
until that policy exists.

Local PostgreSQL is reached only through loopback. A remote production database must require an
authenticated encrypted connection according to its provider (prefer certificate verification,
not merely opportunistic encryption), use a least-privilege role, and remain non-public. The
generic connection-URL validator does not prove the provider's CA or network policy, so deployment
must treat database TLS verification as a release gate.

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
