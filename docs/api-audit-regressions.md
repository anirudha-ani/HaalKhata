# API audit regressions

The November 2026 system audit reproduced failures in access changes, content
cleanup, payment eligibility and history-dependent database work. Each repair
has its own commit with a Why / What / How explanation and a regression test.

## Run locally

Use the normal installed workspace and generated protobuf sources (`pnpm gen`).
Start local PostgreSQL with the repository's development setup. Integration tests
create uniquely named disposable databases; they do not alter the regular
application database. Their default admin connection is the local development
Postgres instance. `MERGE_TEST_ADMIN_URL` can select a different local admin
connection. Set `MODERATION_TEST_CONTAINER=haalkhata-db-1` when running the SQL
operator parity cases against the standard Compose container.

Before each repair commit run:

```sh
pnpm typecheck
pnpm lint
MODERATION_TEST_CONTAINER=haalkhata-db-1 pnpm test --maxWorkers=2 --testTimeout=30000 --hookTimeout=60000
pnpm proto:lint
pnpm test:parity
```

Changes to mobile or shared code additionally run the corresponding typecheck,
lint and test scripts; shared changes run all three applications' sets. Check the
test summary for skipped database tests: a run without PostgreSQL does not verify
these regressions. Provider credentials are unnecessary for database/usecase
regressions. Interactive Google/Apple authentication still uses the real provider
setup in [local-auth.md](local-auth.md), with no production authentication bypass.

Concurrency tests wait for observable database locks before making a competing
change. They assert the final access, data and announcements, rather than relying
on sleeps to happen to hit the race. Performance tests should assert bounded
query counts/rows or equivalent plan properties, not machine-dependent timings.

## Repairs

| Audit ID | Behavior protected | Regression |
| --- | --- | --- |
| API-10 | A comment waiting for a group or expense lock must recheck membership before writing. Refused writes leave no comment, operation claim or announcement. Deleted-expense discussion and idempotent replay still work. | `apps/web/src/server/expense/usecase/formerMemberBalance.integration.test.ts` |
| API-01 | New comment previews, activity audiences and queued pushes exclude former members, including the original creator. Current participants still hear about the comment. | `apps/web/src/server/expense/usecase/formerMemberBalance.integration.test.ts` |
