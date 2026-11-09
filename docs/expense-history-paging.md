# Expense detail history

`GetExpense` includes at most 30 edit events and defaults to 30 comments.
An explicit comment limit is capped at 100. Both sections return their own
continuation cursor and truncation flag, including for older clients that
send a zero comment limit. Payments retain their existing separate cursor.

Both apps show **Show earlier changes** above History. This calls
`ListExpenseHistory`, which checks the viewer's current expense access and
reads the page in the same database snapshot. Comments, including the newest
ones in the detail response, use their access snapshot too: a comment added
after the viewer is removed cannot be returned using the earlier permission. It returns at most 30 events,
ordered by exact creation time and id. The cursor belongs to one expense.
Failed reads leave loaded changes visible with a retry error beside the
button. Navigating to another bill or receiving a new first-page boundary
resets earlier-page state. Expense invalidation clears the history queries;
signing out clears the account's query cache as usual.

Comment pages inspect a bounded recent window. When most of it is hidden by
blocks, indexed seeks enumerate each distinct historical author once and read
a bounded page per visible author. Former members' comments are retained.
The sparse fallback scales with distinct authors rather than comment count;
a long blocked thread by one author stays bounded. Ordinary visible pages
use only the recent window. Both directions of a block apply in either path.

Reporting a comment checks its expense access without loading other
comments, edit events or financial balances. Reporting a bill reads only
its author, description, notes and receipt-line names after authorization.

## Local verification

Use the real local PostgreSQL service and the repository's configured test
credentials. Run:

```sh
MODERATION_TEST_CONTAINER=haalkhata-db-1 pnpm test --maxWorkers=2 --testTimeout=30000 --hookTimeout=60000 pagination.integration useEarlierHistoryAPI requestGates requestCaps
pnpm test:mobile --maxWorkers=2 useEarlierHistoryAPI
pnpm test:shared
pnpm test:parity
```

The database test creates its own disposable database. It adds 600 comments
and 300 events sharing an exact timestamp, checks first-page bounds, consumes
every history page without duplicates, refuses unauthorized and foreign
cursors, and checks that reporting one comment does not hydrate its thread.
The web and mobile hook tests exercise opt-in reads, successive pages,
failed-page retries and navigation/boundary resets.

For manual UI verification, start the web app and iOS development client with
`./dev.sh --mobile-ios`, then sign in through the provider setup in
[local-auth.md](local-auth.md). On an expense with more than 30 saved changes,
open History, load earlier changes twice, interrupt the connection and retry,
then open another bill. Confirm the newest detail remains present, earlier
changes appear in chronological order, the retry error stays beside its
control, and the other bill starts with its own history. Check narrow web,
iPhone, iPhone Duo and iPad layouts using the same flow.
