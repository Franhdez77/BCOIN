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

## Sprint 1 authentication schema

The reviewed authentication migration is `20260811120000_sprint_1_authentication`. Deployment and
CI apply committed migrations with:

```text
npm exec --workspace=apps/api -- prisma migrate deploy
```

It introduces these auth-owned models:

- `User`: preserves entered email/username while enforcing unique normalized email and username;
  stores only `passwordHash`, role (`USER`/`ADMIN`), account status
  (`ACTIVE`/`SUSPENDED`/`BANNED`), verification, password-change, and audit timestamps.
- `AuthSession`: one revocable refresh family with expiry, revocation reason, last-use time, and
  bounded user-agent/IP-derived metadata needed for session management.
- `RefreshToken`: a rotation chain whose random secret is hash-only; parent linkage is unique so a
  token cannot be advanced twice without reuse detection.
- `EmailVerificationToken` and `PasswordResetToken`: hash-only, expiring, single-use records with
  consumed/revoked state. Partial unique constraints permit at most one active token of each
  purpose per user.
- `SecurityEvent`: security-event type plus optional user/session/request references, an
  HMAC-derived subject hash, and bounded safe JSON metadata. It must not contain credentials,
  token material, password hashes, raw request bodies, or unrestricted personal data.

Indexes follow the implemented access paths: normalized identities, user/session active lookups,
token expiry and creation order, and security-event user/type/time queries. Token and session
state transitions that enforce rotation, consumption, or revocation must be transactional so two
requests cannot both consume the same credential.

Sprint 1 intentionally does not add `Wallet` or `CoinTransaction`. Although product acceptance
expects a wallet after registration, creating an unledgered placeholder would violate the
economic invariants. Sprint 2 owns the wallet/ledger migration, backfill for existing users, and
atomic wallet creation for future registrations.

## Sprint 2 user/wallet schema

Sprint 2 introduces migration `20260813020000_sprint_2_user_wallet_ledger`.

`Wallet` is a one-to-one extension of `User` backed by a unique `wallets.userId` constraint. Its
authoritative BIC balance is `BIGINT`, with one stored integer unit equal to one whole BIC for the
MVP. `wallets.balance >= 0` is enforced by PostgreSQL.

`WalletTransaction` records every non-zero economic movement with:

- signed `BIGINT amount`;
- `balanceBefore` and `balanceAfter`;
- `CREDIT`, `DEBIT`, or `ADJUSTMENT` type;
- optional reference type/id pair;
- a required globally unique idempotency key;
- optional internal actor/request/reason/metadata fields;
- UTC creation timestamp.

Database checks enforce `balanceAfter = balanceBefore + amount`, non-negative before/after
balances, valid amount direction for transaction type, and all-or-nothing reference pairs.
Reference type/id is unique when populated so one source event cannot be credited twice through a
different idempotency key.

The migration backfills every Sprint 1 user with exactly one zero-balance wallet using an
`INSERT ... SELECT ... ON CONFLICT ("userId") DO NOTHING`. Creating a wallet at zero is not an
economic movement and therefore does not create a synthetic ledger entry.

New registrations create User + Wallet inside the existing serializable registration transaction.
Failure of wallet provisioning rolls the whole registration back.

The ledger is database-immutable: PostgreSQL triggers reject row-level `UPDATE` and `DELETE`.
Corrections must be represented by compensating entries. Wallet rows and ledger rows use
`ON DELETE RESTRICT` toward their economic owners so account deletion cannot silently erase
history.

Transaction history uses the composite access path `(walletId, createdAt DESC, id DESC)`.
Idempotency and the source reference tuple have unique indexes.

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
