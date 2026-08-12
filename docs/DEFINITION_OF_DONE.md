# Definition of Done

A story/task is complete only when all applicable items are true.

## Functionality
- Acceptance criteria are demonstrably met.
- Edge/error cases are handled.
- Existing behavior remains intact.

## Architecture
- Code is in the correct domain/module.
- No duplicated business logic.
- No unrelated refactors.
- Public contracts are documented when changed.

## Security
- Backend validates all external input.
- Authorization is enforced for protected resources.
- No sensitive values are logged/exposed.
- Economic/game authority stays server-side.
- Idempotency/concurrency is addressed where required.

## Data
- Migration is safe/reviewed.
- Constraints/indexes reflect required invariants/query patterns.
- Destructive changes have explicit migration strategy.

## Quality
- Lint passes.
- Typecheck passes.
- Relevant unit tests pass.
- Relevant integration tests pass.
- Required E2E tests pass.
- Production build passes.

## Operations
- Config/env changes are documented.
- Health/observability impact is considered.
- Dependency additions are justified.

## Documentation
- Relevant docs updated.
- Final task report lists changed files, migrations, commands/tests run, risks, and follow-ups.
