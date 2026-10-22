<!-- Private reporting, user blocking and internal moderation service reference. -->

# Safety Service (`safety.v1.SafetyService`)

User-content reports and blocking are authenticated controls available in both
apps. They do not erase, forgive or recalculate shared financial history.

Contract: [safety.proto](../../../proto/safety/v1/safety.proto).
Implementation: [handler.ts](../../../apps/web/src/server/safety/handler.ts) →
[safety.usecase.ts](../../../apps/web/src/server/safety/usecase/safety.usecase.ts) →
[safety.repo.ts](../../../apps/web/src/server/safety/repo/safety.repo.ts).

## RPCs

All routes are `POST /api/connect/safety.v1.SafetyService/<Method>`. Report,
block and unblock share a 10/min per-account mutation bucket.

| Method | Request | Result |
| --- | --- | --- |
| `ReportContent` | `target_kind`, `target_id`, `reason` | Empty |
| `BlockUser` | `user_id` | Empty |
| `UnblockUser` | `user_id` | Empty |
| `ListBlockedUsers` | Empty | `users`: minimal public profiles from the caller's own block list |

Allowed target kinds: `comment`, `expense`, `group`, `user`. Reasons:
`harassment`, `hate`, `sexual`, `spam`, `other`. The server rejects other values.
A report requires access to its expense, membership in its group, or an already
visible person through a shared expense/group, friendship or pending request.
For a comment, the parent expense authorization applies.

The private report stores an original server-owned content snapshot and author
ID. A caller cannot fabricate a snapshot or enumerate unrelated content. Open
reports from the same caller for the same target are deduplicated. Ordinary
clients cannot list reports or see a reporter's identity.

## Blocking behavior

Either direction of a block suppresses comments and activity before pagination,
filters actor-attributed notifications, and prevents new friendship requests,
reminders, invite interactions, membership additions and financial pairings.
Blocking removes pending requests and clears the blocker's existing notification
inbox. Unblocking removes only the caller's preference; the other person's
block remains effective.

Shared balances, expense history and legitimate corrections involving the
expense's existing participants remain available. A debt does not prevent a
block. Blocked People in Account lists the caller's private choices and allows
unblocking. Both clients invalidate affected queries after a block changes.

A basic server text filter rejects known slurs/threats after Unicode
compatibility normalization. It covers shared names, descriptions, notes and
comments. Provider display names use a neutral fallback without rejecting
otherwise valid sign-in. This filter is limited; reported content still needs
human review.

## Internal moderation

There is no public moderator RPC or client role toggle. The operator runs
[ops/moderate.sh](../../../ops/moderate.sh) over the private Docker database
connection. SQL is read from the matching deployed image at
`/opt/release/moderation.sql`.

```sh
./ops/moderate.sh list
./ops/moderate.sh remove <report UUID>
./ops/moderate.sh dismiss <report UUID>
./ops/moderate.sh suspend <report UUID>
./ops/moderate.sh resume <report UUID>
```

Removal erases comments or redacts shared text/profile content and duplicated
activity/notification quotations. Monetary records stay intact. Dismissal
closes the report. Suspension/resumption changes `suspended_at` and increments
`token_version`; both RPC authentication and server-rendered session loading
reject a suspended account, including freshly minted tokens.

The operator must monitor the queue and support mailbox and record actions
privately for restore handling. See [ops/README.md](../../../ops/README.md).
Real PostgreSQL tests exercise authorization, deduplication, blocking and the
actual moderator SQL, including token invalidation and per-currency preservation.
