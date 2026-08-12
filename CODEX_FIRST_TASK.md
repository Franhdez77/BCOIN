# Codex Task 000 — Sprint 0 Foundation

## Objective
Bootstrap the BichoCoin monorepo without implementing authentication, mining, wallet logic, games, leaderboards, or rewards yet.

## Required reading
Before editing, read:
- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/DATABASE.md`
- `docs/API.md`
- `docs/DEFINITION_OF_DONE.md`

## Required implementation
Create and configure:

### Repository
- npm workspaces monorepo
- `apps/web`
- `apps/api`
- root scripts for lint, typecheck, test, build
- `.editorconfig`
- `.gitignore`
- `.env.example`

### Web
Bootstrap a current stable Next.js App Router application with:
- TypeScript strict mode
- ESLint
- Tailwind CSS
- `src/` directory
- import alias `@/*`
- minimal home page only
- minimal health/API connectivity placeholder, but no product features

### API
Bootstrap a current stable NestJS application with:
- TypeScript strict mode
- config module with environment validation
- global validation pipe configured securely
- global error shape foundation
- request/correlation ID foundation
- structured logger foundation
- `/health/live`
- `/health/ready`
- no product domain implementation yet

### Database
- PostgreSQL 18 in Docker Compose
- Prisma configured for PostgreSQL
- initial schema may contain no product tables yet, or only infrastructure-safe placeholders
- create a clean first migration only if needed

### Security foundation
- secure HTTP headers
- restrictive environment-based CORS configuration
- request body size limits
- environment validation that fails fast
- no secrets committed
- dependency audit command

### Quality
- unit-test foundation for API and web
- CI workflow that runs install, lint, typecheck, tests, build, and dependency audit
- commit lockfile after installation

## Constraints
- Do not implement auth, users, wallet, mining, quiz, rankings, rewards, or admin yet.
- Do not add Redis, queues, WebSockets, microservices, Kubernetes, or blockchain.
- Do not add libraries without a concrete need.
- Do not introduce Turborepo/Nx unless a measured need appears later.
- Do not weaken TypeScript, ESLint, tests, or security configuration to make setup easier.

## Acceptance criteria
- `npm ci` succeeds from a clean checkout after lockfile exists.
- local PostgreSQL starts with Docker Compose.
- API starts and health endpoints respond.
- web starts and renders a minimal page.
- web can be configured to know the API base URL without hardcoding production URLs.
- lint passes.
- typecheck passes.
- tests pass.
- builds pass.
- CI contains all required checks.
- no secrets are committed.
- docs explain exact local startup commands.

## Required final report from Codex
Return:
1. architecture created;
2. files changed;
3. dependencies added and why;
4. commands executed;
5. test/build results;
6. security controls established;
7. known limitations;
8. recommended next task.
