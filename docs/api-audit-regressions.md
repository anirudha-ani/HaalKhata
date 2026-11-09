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
| API-12 | A block between two incumbents prevents an unrelated person joining | `apps/web/src/server/social/usecase/inviteLinkExpiry.integration.test.ts` |
| API-02 | A removed member can finish minting a fresh invite after explicit revocation | `apps/web/src/server/social/usecase/inviteLinkExpiry.integration.test.ts`, `apps/web/src/server/social/usecase/inviteLinks.test.ts` |
| API-03 | Queued acceptance grants membership after its group invite was revoked | `apps/web/src/server/social/usecase/inviteLinkExpiry.integration.test.ts` |
| API-13 | Concurrent acceptance announces a single group join twice | `apps/web/src/server/social/usecase/inviteLinkExpiry.integration.test.ts`, `apps/web/src/server/social/usecase/inviteLinks.test.ts` |
| API-04 | A failed live-split join leaves permanent group access | `apps/web/src/server/expense/usecase/liveSplit/liveSplit.integration.test.ts` |
| API-05 | Direct member addition bypasses a block enforced by invite links | `apps/web/src/server/group/usecase/groupEnrolment.integration.test.ts` |
| API-14 | Concurrent creation exceeds the per-person 200-group limit | `apps/web/src/server/group/usecase/groupEnrolment.integration.test.ts` |
| API-11 | A blocked friend request can reappear after blocking completes | `apps/web/src/server/social/usecase/contacts/contacts.integration.test.ts` |
| API-15 | Legacy unverified phone rows still route invitations and membership | `apps/web/src/server/group/usecase/groupEnrolment.integration.test.ts`, `apps/web/src/server/group/usecase/simplifyDebts.test.ts`, `apps/web/src/server/social/usecase/inviteLinks.test.ts`, `apps/web/src/server/social/usecase/reminderCooldown.test.ts`, `apps/web/src/server/social/usecase/removeFriend.test.ts`, `apps/web/src/server/social/usecase/socialAuthorization.test.ts` |
| API-06 | Removed or erased expense titles remain visible in payment statements | `apps/web/src/server/adminmoderation/usecase/moderation.integration.test.ts`, `apps/web/src/server/auth/repo/deletion/accountDeletion.integration.test.ts`, `apps/web/src/server/auth/usecase/deletion/accountDeletion.test.ts`, `apps/web/src/server/common/db/releaseMigrations.integration.test.ts`, `apps/web/src/server/common/ledger/accountContentLocks.integration.test.ts` |
| API-07 | Deleting an account rewrites unrelated users’ notification content | `apps/web/src/server/auth/repo/deletion/accountDeletion.integration.test.ts`, `apps/web/src/server/auth/usecase/account/googleSignInDeletionRace.integration.test.ts`, `apps/web/src/server/common/db/releaseMigrations.integration.test.ts` |
| API-08 | Removing a push device can leave it active | `apps/web/src/server/push/push.integration.test.ts`, `apps/web/src/server/push/usecase/devices/devices.usecase.test.ts` |
| API-16 | Blocking an unrelated person resets reminder cooldowns | `apps/web/src/server/common/db/releaseMigrations.integration.test.ts`, `apps/web/src/server/social/usecase/poolSaturation.integration.test.ts`, `apps/web/src/server/social/usecase/reminderCooldown.test.ts` |
| API-22 | Every activity page rescans all visible history for the month selector | `apps/mobile/src/screens/activity/components/ActivityScreen/hooks/useActivity.test.ts`, `apps/web/src/app/(app)/activity/components/ActivityPage/hooks/useActivity.test.ts`, `apps/web/src/server/social/repo/activityPaging.integration.test.ts` |
