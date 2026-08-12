# Database Design — MVP Target

The product schema is introduced incrementally by sprint. Do not create all tables in Sprint 0 merely because they are listed here.

## Sprint 0 state

Sprint 0 uses PostgreSQL 18.4 and Prisma 7, but defines no product models and therefore creates no
initial migration. The Prisma client is still generated so the API can verify connectivity for
readiness with `SELECT 1`. No placeholder table is needed.

Local PostgreSQL runs from the pinned Docker image in `docker-compose.yml`. PostgreSQL 18 stores
its versioned data directory beneath `/var/lib/postgresql`, so the named volume is mounted at that
path rather than the pre-18 `/var/lib/postgresql/data` path. The host port is bound to
`127.0.0.1` for local development.

`DATABASE_URL` is required and validated when the API starts. Prisma CLI generation can run in a
clean checkout without a database or secret; commands that connect still require a real
`DATABASE_URL`. Local credentials live only in the ignored `.env` file. Production credentials
must come from a secret manager and use a least-privilege application role.

Foundation commands are:

```text
npm run prisma:generate
npm run prisma:validate
```

There is no migration to review for Sprint 0. The first schema migration belongs to the sprint
that introduces its owning domain model.

## Target entities

### User

- id (UUID/cuid-style non-sequential public-safe identifier)
- email (unique, normalized policy documented)
- username (unique)
- passwordHash
- role
- status
- createdAt
- updatedAt

### Session / RefreshSession

- id
- userId
- tokenHash / session secret representation
- expiresAt
- revokedAt
- createdAt
- metadata fields only when justified

### Wallet

- id
- userId (unique)
- balance (exact integer/decimal strategy; no floating point)
- createdAt
- updatedAt

### CoinTransaction

- id
- walletId
- type
- amount
- balanceBefore
- balanceAfter
- referenceType
- referenceId
- idempotencyKey/reference uniqueness as appropriate
- metadata (JSON only for non-core query fields)
- createdAt

### MiningSession

- id
- userId
- status
- startedAt
- expiresAt
- rewardAmount
- claimedAt
- createdAt

Enforce one active mining session per user using the strongest practical database/application combination. Claim uniqueness must be database-backed.

### Game

- id
- code (unique)
- name
- description
- status
- createdAt
- updatedAt

### GameSession

- id
- userId
- gameId
- status
- startedAt
- finishedAt
- score
- metadata only for non-relational game-specific details

### QuizCategory

- id
- code/name
- active

### QuizQuestion

- id
- categoryId
- question
- difficulty
- status
- createdAt
- updatedAt

### QuizAnswer

- id
- questionId
- answer
- isCorrect

The API must select fields so `isCorrect` is never exposed in play payloads.

### QuizSessionQuestion / QuizResponse

Persist issued questions and submitted answers sufficiently to make sessions auditable and scoring deterministic. Do not rely on a mutable question bank alone after a session has started if later edits could change historical scoring.

### Leaderboard / Period

- id
- type/scope
- gameId nullable by scope
- periodStart
- periodEnd
- status

### LeaderboardEntry

- leaderboardId
- userId
- score
- rank can be derived/materialized depending on implementation

### RewardDefinition

- id
- scope/period type
- positionFrom / positionTo or equivalent
- rewardType
- amount
- active/version/effective period fields

### RewardClaim / RewardIssuance

- id
- userId
- rewardDefinitionId
- leaderboard/period reference
- status
- coinTransactionId nullable until issued
- createdAt

Unique constraints must prevent duplicate issuance for the same eligibility event.

### AuditLog

- id
- actorUserId nullable for system
- action
- resourceType
- resourceId
- requestId
- safe metadata
- createdAt

## Money/coin numeric strategy

BIC balances must never use JavaScript floating-point arithmetic for authoritative financial state. For MVP rewards of whole BIC, prefer integer smallest units. If fractional BIC is needed later, define a fixed smallest unit (e.g. atomic units) and store integers, or use an exact database decimal with carefully controlled serialization.

## Query/index principles

Index real access paths, including unique email/username, wallet user, active mining lookup, transaction history by wallet/time, game sessions by user/game/time, and leaderboard score queries.

Use pagination for all unbounded history/admin lists.
