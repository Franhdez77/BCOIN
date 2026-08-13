# Product Specification — BichoCoin MVP

## Vision
BichoCoin is a football-themed gaming and digital-economy platform. The web MVP is the first product in a future ecosystem around a planned cryptocurrency.

The MVP is not the cryptocurrency itself. `BIC` in this version is an internal application balance used to validate the product economy and engagement loop.

## Core loop
1. User registers and signs in.
2. User starts a 24-hour mining session.
3. After the session is eligible, the user claims a backend-calculated BIC reward.
4. User plays Football Quiz.
5. Backend calculates score from validated answers.
6. Score contributes to game/general period rankings.
7. Eligible ranking positions receive configured rewards.
8. All BIC movements are recorded in an immutable ledger.

## Actors
### User
Can register, sign in, view profile, mine, claim, play, view rankings, and receive eligible rewards.

### Admin
Can manage users, quiz content, game availability, reward configuration, and view audit information. Admin capabilities must be backend-authorized.

### System
Validates sessions, scores, economic transactions, ranking periods, reward eligibility, and security invariants.

## MVP epics
- E01 Authentication and sessions
- E02 User/profile
- E03 Wallet and ledger
- E04 Mining
- E05 Game platform core
- E06 Football Quiz
- E07 Leaderboards
- E08 Rewards
- E09 Administration/audit
- E10 Security, testing, observability, release

## MVP user stories
### US-001 Registration
As a visitor, I want to create an account so I can use BichoCoin.

Acceptance: unique email/username, secure password storage, strict validation, safe error behavior,
and automatic wallet creation handled safely once Sprint 2 introduces the wallet and immutable
ledger together. Sprint 1 registrations are backfilled by that migration; authentication must not
create an unledgered placeholder balance.

### US-002 Login/session
As a user, I want to sign in securely and maintain a revocable session.

### US-003 Logout
As a user, I want to revoke the current session; I also need a way to revoke all sessions.

### US-004 Password recovery
As a user, I want a secure single-use password reset flow.

### US-005 Profile
As a user, I want to view/update allowed profile data and see relevant aggregate statistics.
Sprint 2 permits username updates only. Aggregate statistics remain deferred until the domains
that produce real Mining/Quiz/Leaderboard data exist.

### US-006 Wallet
As a user, I want to view my current internal BIC balance.

### US-007 Transaction history
As a user, I want to view paginated BIC ledger entries associated with my wallet.

### US-008 Start mining
As a user, I want to start one 24-hour mining session if I have no active session.

### US-009 View mining status
As a user, I want to view authoritative server mining state, start/end times, and reward eligibility.

### US-010 Claim mining reward
As a user, I want to claim an eligible reward exactly once.

### US-011 Mining history
As a user, I want to view previous mining sessions.

### US-012 Game catalog
As a user, I want to see enabled games. MVP exposes Football Quiz only.

### US-013 Start quiz
As a user, I want the server to create a quiz session and provide questions without exposing correct-answer flags.

### US-014 Submit quiz answer
As a user, I want to submit an answer and receive the server-evaluated result.

### US-015 Finish quiz
As a user, I want my final score to be calculated by the server and recorded once.

### US-016 Quiz statistics
As a user, I want to see my quiz performance history/aggregates.

### US-017 Leaderboards
As a user, I want to view global, quiz, weekly, and monthly rankings with my own position when available.

### US-018 Ranking rewards
As an eligible user, I want the system to issue the configured period reward exactly once.

### US-019 Admin users
As an admin, I want to list/search and suspend/reactivate users.

### US-020 Admin quiz content
As an admin, I want to manage quiz categories, questions, answers, difficulty, and active state.

### US-021 Admin reward configuration
As an admin, I want to configure ranking rewards without code changes.

### US-022 Audit
As an authorized admin, I want to inspect sensitive administrative/economic events.

## Non-functional requirements
- No known regression from new work.
- Strict TypeScript.
- Automated test coverage focused on risk.
- Atomic/idempotent economic operations.
- P95 performance targets will be measured after functional MVP; avoid obvious N+1 and unbounded queries from day one.
- Pagination required for growing collections.
- UTC persistence; period timezone strategy documented centrally.
- Accessible and responsive web UI.
- Basic observability and health checks.
