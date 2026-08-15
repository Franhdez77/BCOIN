# API Contract — MVP Draft

Base path: `/api/v1`

This is a target contract; individual endpoints are implemented by their sprint.

## Response conventions

Successful resource responses use appropriate HTTP status codes and a predictable body.

Suggested envelope where useful:

```json
{
  "success": true,
  "data": {},
  "requestId": "..."
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "MINING_ALREADY_ACTIVE",
    "message": "An active mining session already exists."
  },
  "requestId": "..."
}
```

Do not expose implementation details. Use stable application error codes.

## Authentication

The exact Sprint 1 routes, including the base path, are:

- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/:sessionId`

`GET /api/v1/auth/csrf` sets an HttpOnly nonce cookie and returns:

```json
{
  "success": true,
  "data": {
    "csrfToken": "an-HMAC-bound-to-the-cookie-nonce"
  },
  "requestId": "a-server-correlation-id"
}
```

Clients send that value as `X-CSRF-Token` and include credentials on every unsafe request. Login
or refresh can rotate the nonce and return a replacement in the same `data.csrfToken` field. The
access JWT and opaque refresh credential exist only in HttpOnly cookies; they are not response-body
fields and must not be stored by browser JavaScript. All unsafe routes above require CSRF, exact
Origin validation, and compatible Fetch Metadata. Authentication and recovery errors use generic
responses where account existence would otherwise leak.

OpenAPI UI is available at `/api/docs` and its JSON document at `/api/docs-json` only when
`OPENAPI_ENABLED=true` and `NODE_ENV` is not `production`. Production keeps both routes disabled
even if the environment flag is accidentally enabled.

## User

- `GET /users/me` returns the authenticated user's safe profile projection.
- `PATCH /users/me` accepts only `{ "username": "..." }`.
- `GET /users/me/stats` is deliberately deferred until Mining/Quiz/Leaderboard domains exist; the
  API does not invent zero/fake statistics.

Profile routes derive ownership from the authenticated principal. They do not accept `userId` as
authority. Email, role, status, password, wallet balance, and other sensitive fields cannot be
changed through the profile DTO.

## Wallet

- `GET /wallet` returns the authenticated user's wallet:

```json
{
  "wallet": {
    "id": "uuid",
    "currency": "BIC",
    "balance": "0",
    "createdAt": "2026-08-13T00:00:00.000Z"
  }
}
```

- `GET /wallet/transactions?cursor=&limit=` returns newest-first immutable ledger history.
- `limit` defaults to 20 and is capped at 50.
- economic integers are serialized as decimal strings so browser JavaScript never becomes the
  authoritative numeric representation.
- internal idempotency keys, actor/request data, reasons, and safe internal metadata are not
  returned by the public history API.

No user endpoint exists to directly add/set/subtract balance.

## Mining

Sprint 3 implements the following authenticated routes under `/api/v1`:

- `POST /mining/start` accepts no client-owned mining/economic fields. It creates one server-timed
  open session when none exists and returns HTTP `201`.
- `GET /mining/current` returns `{ "session": null }` when no open session exists, otherwise the
  authoritative open session.
- `POST /mining/claim` accepts no client-owned mining/economic fields. It returns HTTP `200` only
  after the backend determines that the session is eligible.
- `GET /mining/history?cursor=&limit=` returns newest-first user-owned sessions. `limit` defaults to
  20 and is capped at 50.

A public mining session contains `id`, `startedAt`, `endsAt`, nullable `claimedAt`, decimal-string
`rewardAmount`, server-derived `eligible`, and `createdAt`. It never exposes or accepts `userId` as
an ownership selector. The frontend countdown is informational; only the backend `eligible` value
and claim operation are authoritative.

Current policy is configured by `MINING_DURATION_SECONDS=86400` and `MINING_REWARD_BIC=100`. The
reward is snapshotted into each session at start, so later configuration changes affect only new
sessions.

An open session means `claimedAt IS NULL`. A completed-but-unclaimed session therefore blocks a
new start until it is claimed. Claim uses the stored reward and credits the wallet through
`WalletApplicationService` in the same serializable transaction that records `claimedAt`. The
ledger reference is `referenceType=MINING`, `referenceId=<miningSessionId>`, with deterministic
idempotency key `mining:claim:<miningSessionId>`.

Stable mining errors include `MINING_ALREADY_ACTIVE`, `MINING_SESSION_NOT_FOUND`,
`MINING_NOT_ELIGIBLE`, `MINING_ALREADY_CLAIMED`, and `MINING_CURSOR_INVALID`. Unexpected Prisma or
SQL details are never returned to clients.

## Games

- `GET /games`

## Quiz

- `POST /games/quiz/sessions`
- `GET /games/quiz/sessions/:sessionId`
- `POST /games/quiz/sessions/:sessionId/answers`
- `POST /games/quiz/sessions/:sessionId/finish`
- `GET /games/quiz/history?cursor=&limit=`

Client never posts authoritative final score.

## Leaderboards

- `GET /leaderboards/global`
- `GET /leaderboards/weekly`
- `GET /leaderboards/monthly`
- `GET /leaderboards/games/:gameCode`

Support bounded pagination/top-N and `me` position metadata where appropriate.

## Rewards

- `GET /rewards/me`
- issuance/claim design to be finalized in reward sprint; prefer automatic server issuance where possible to reduce client-driven economic mutation.

## Admin

Namespace: `/admin`

- users search/status
- quiz CRUD/status
- game status
- reward configuration
- leaderboard inspection
- audit inspection

Every admin endpoint requires explicit backend authorization and audit logging for mutations.

## Health

- `GET /health`
- `GET /health/live`
- `GET /health/ready`

These operational routes are deliberately outside `/api/v1`:

- `/health/live` confirms that the HTTP process is running and does not query dependencies.
- `/health/ready` verifies PostgreSQL with Prisma before reporting readiness.
- `/health` is an aggregate readiness alias for operators and local smoke checks.

Successful health responses use the normal success envelope:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  },
  "requestId": "a-server-correlation-id"
}
```

When PostgreSQL is unavailable, readiness returns HTTP `503` using the normal safe error envelope.
Health responses include no credentials, connection strings, database host details, raw Prisma
errors, or stack traces. They are marked `Cache-Control: no-store`.

Every API response exposes its correlation identifier in both the response body and the
`X-Request-ID` header. Sprint 0 always replaces a client-supplied identifier with a server-generated
UUID so untrusted values never enter logs. A future trusted-proxy propagation policy must be
explicit rather than inferred from this public header.
