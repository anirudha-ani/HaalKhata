# Push Service (`push.v1.PushService`)

This service manages the phones that receive a person's push notifications and
the categories they want. It also runs the dispatcher that turns committed bell
rows into pushes.

Every push is a copy of one in-app notification (a `notifications` row). The
bell stays the record, and a push is a courtesy on top of it. When a push is
skipped, delayed or lost, the bell still has the row.

## iOS notification content

The title is the actor's full display name. The body starts with the action
and its money details, followed by the group or one-off scope and bill label.
Expense amounts precede free-form labels, which native QA showed can otherwise
hide the reader's share even within the payload cap. The separate body keeps
a long actor name from displacing the action and amount. Do not guess a
first name, repeat the app's name, put a generic
"Settlement" in the body, or spend the message explaining where to tap.

This follows [Apple's notification guidance](https://developer.apple.com/design/human-interface-guidelines/notifications):
brief, informative titles; succinct body content; and related content on tap.
iOS controls the available width and truncation, including at larger text
sizes. The 120/240-character push limits are payload safeguards, not a claim
that that many characters fit in a collapsed banner.

The common composition is in `social/usecase/personNotification.ts`. Payment
copy and scope selection are in `expense/usecase/settlementNotification.ts`.
User-entered bill/group labels use a 32-code-point
excerpt, without splitting an emoji sequence, so they cannot consume the
space needed for the other facts. Actor titles retain their full display
names. Full labels remain on the linked record and in the activity feed.
Expense money lines omit the payer's name, so the amount stays readable
without repeating another person's name. Personal names that are stored remain
whole, so moderation and account deletion can find and replace them.
There is no separate client-side rewrite, so existing iPhone builds receive
the new copy as soon as the server is deployed. Existing bell rows retain
their original words.

| Event | Title | Body example |
| --- | --- | --- |
| Expense added | Radhika Mehrotra | Added expense · you owe $24.00 · Goa trip · "Dinner" |
| Expense edited | Radhika Mehrotra | Updated expense · now you owe $20.00 · Goa trip · "Dinner" |
| Expense deleted | Radhika Mehrotra | Deleted expense · Goa trip · "Dinner" |
| Removed from expense | Radhika Mehrotra | Removed you · you no longer owe $24.00 · Goa trip · "Dinner" |
| Comment | Radhika Mehrotra | Commented on "Dinner" · Goa trip · I'll cover the tip |
| Payment recorded by payer | Radhika Mehrotra | Recorded $25.00 to you · Goa trip |
| Payment recorded by payee | Radhika Mehrotra | Recorded $25.00 from you · Goa trip |
| Net payment | Radhika Mehrotra | Recorded $25.00 to you · 2 groups + One-off expenses · Settled up in USD |
| Payment removed | Radhika Mehrotra | Removed $25.00 payment to you · Goa trip · Balances restored |
| Reminder | Radhika Mehrotra | Reminded you: you owe $25.00 · Radhika prefers Zelle. |
| Added to group | Radhika Mehrotra | Added you to "Goa trip" |
| Members added | Radhika Mehrotra | Added 2 members · Goa trip · Priya and Sara |
| Member joined | Radhika Mehrotra | Joined "Goa trip" |
| Group ownership | Radhika Mehrotra | Made you the group owner · Goa trip |
| Simplification | Radhika Mehrotra | Turned on simpler payments · Goa trip · Same balances, fewer payments |
| Friend request | Radhika Mehrotra | Sent you a friend request. |
| Friend request accepted | Radhika Mehrotra | Accepted your friend request |
| Invite accepted | Radhika Mehrotra | Joined "Goa trip" · Via your invite |
| Security alert | Phone number moved | •••42 was verified on another account. Still yours? Verify it again in Account. |

Amounts use the existing minor-unit formatter, including zero- and
three-decimal currencies. "Recorded" describes somebody entering an external
payment; it does not claim HaalKhata transferred funds. Payment scopes come
from every stored row, including offsets, rather than the page it was entered
from. Net outcomes name the remaining debtor, or say settled up only in the
payment's currency. Removal reads the cash direction even if an offset row
was selected. Method names may appear in reminders; their identifiers never do.

Security alerts have short event titles, and the push builder masks numbers
in their bodies. Hidden-preview categories, routing data, badges, grouping,
delivery deduplication and recipient checks continue to apply.
Comment notifications now name their group, so both moderation paths also
remove that quotation when a reported group name is removed, before any
queued push can send it.

Implementation:

- [handler.ts](../../../apps/web/src/server/push/handler.ts): the handler.
- [devices.usecase.ts](../../../apps/web/src/server/push/usecase/devices/devices.usecase.ts) and [preferences.usecase.ts](../../../apps/web/src/server/push/usecase/preferences/preferences.usecase.ts): the RPCs.
- [dispatch.usecase.ts](../../../apps/web/src/server/push/usecase/dispatch/dispatch.usecase.ts): the dispatcher.
- [receipts.usecase.ts](../../../apps/web/src/server/push/usecase/receipts/receipts.usecase.ts): delivery receipts.
- [expoPush.provider.ts](../../../apps/web/src/server/push/usecase/provider/expoPush.provider.ts): the only code that talks to Expo.
- [pushWorker.ts](../../../apps/web/src/server/push/worker/pushWorker.ts): the worker, started by `src/instrumentation.ts`.

---

## RPCs

| RPC | Called from | Rule |
| --- | --- | --- |
| `RegisterDevice` | native only | See [Registering a phone](#registering-a-phone). 10 a minute. |
| `ListDevices` | both | Returns the caller's live phones, most recently seen first. No token is ever returned. |
| `RemoveDevice` | both | Removes the caller's own phone, otherwise `not_found`. The phone then stays off (`push_kept_off`) until it is turned on from that phone. The app calls it for itself before `LogOut` with `signing_out`, which keeps nothing off. |
| `SendTestPush` | both | Sends to the caller's own phone, bypassing the queue. A dead phone gives `failed_precondition` and is forgotten; an unreachable Expo gives `unavailable`. 3 a minute. |
| `GetPreferences` / `UpdatePreferences` | both | Five switches, read and replaced as a whole record. No row means all on. 30 writes a minute. |

### Registering a phone

1. Validate the Expo token shape, the installation id and the platform.
2. Strip invisible characters from the label and app version, and refuse abusive ones.
3. Refuse a phone the caller removed (`FailedPrecondition`) unless the request carries `turn_on`, which clears it. The app sends `turn_on` only when the person turns notifications on from the phone.
4. Upsert on `installation_id` under the version of the session that asked, and only while that is still the account's `token_version`; a sign-out in between leaves nothing written. A token held by another account moves to the caller.
5. Keep the 10 most recently seen phones per user.

## Which notifications become pushes

Every kind in `chk_notifications_type` except the legacy `other`. Each kind maps
to a switch in
[`packages/shared/src/notifications/categories.ts`](../../../packages/shared/src/notifications/categories.ts):

| Switch | Kinds |
| --- | --- |
| Expenses | `expense_added`, `expense_updated`, `expense_deleted` |
| Comments | `comment` |
| Payments | `settlement`, `settlement_deleted`, `reminder` |
| Groups | `added_to_group`, `member_added`, `ownership_transferred`, `simplify_debts` |
| Friends | `friend_request`, `invite_accepted` |
| none (always sent) | `phone_transferred` |

An unknown kind is never pushed. The actor never gets a notification, so never
a push either. Blocks are applied when the row is written.

## The outbox and the dispatcher

**Queueing.** `insertNotifications` inserts a `push_outbox` row for each bell
row on the caller's transaction, then runs `pg_notify('push_outbox')`. NOTIFY
is delivered on commit and dropped on rollback.

**Claiming.** One statement claims up to 100 due rows (`FOR UPDATE SKIP
LOCKED`). It moves `next_attempt_at` 2 minutes ahead as a lease. No transaction
stays open across the HTTP call.

**Dropping before sending.** A claimed row is finished without a send when:

- it was queued more than an hour ago;
- its category is switched off;
- it is over the per-pair cap (more than 10 from one person to another in 10 minutes);
- its recipient has no live phone.

Phones registered under an older `token_version` are deleted at this point.

**Message fields:**

- title and body from the bell row (a phone number is masked);
- `badge` = the unread count;
- `threadId` = the group or the other person;
- `collapseId` = the notification id (it replaces a banner still waiting to be shown, not one already shown, so retries skip phones that took the push);
- `categoryId` = the switch;
- `data` = `{notificationId, link, recipientId}` and nothing else.

**Expo's answers:**

| Answer | Action |
| --- | --- |
| HTTP 429, 5xx, timeout, network error, `UNAUTHORIZED` | Retry the batch |
| Other HTTP 4xx | Send the batch again one message at a time; drop only the messages refused alone |
| `DeviceNotRegistered` | Delete the phone, if it still holds that token |
| `MessageRateExceeded`, `ProviderError`, `ExpoError`, `InvalidCredentials` | Retry the row, to the phones that did not take it |
| `MessageTooBig`, `DeveloperError`, other ticket errors | Drop the message and log it |

Retries wait 30 s, 2 min, 10 min, then 30 min. A row is given up after an hour.
Each row keeps the phones it already reached (`delivered_device_ids`), and a
retry skips them.

**Receipts.** Every 5 minutes the worker reads receipts for tickets 15 minutes
to 24 hours old. A `DeviceNotRegistered` receipt deletes the phone only while
it still holds the token the ticket was sent to (`push_tickets.expo_token`), so
a reinstall's new registration survives the old token's report. The same
pass deletes tickets older than a day and phones unseen for 90 days.

**Waking.** The worker wakes on NOTIFY (a dedicated LISTEN connection) and on a
30 s sweep. One drain runs at a time per process. Two replicas are safe:
`SKIP LOCKED` plus the lease keep them apart. LISTEN starts at boot and
reconnects by itself. The worker never runs migrations: its passes wait until
the first API request or readiness probe has applied them.

## Configuration

| Variable | Values |
| --- | --- |
| `PUSH_PROVIDER` | `expo` or `log`. The default is `log` outside production. |
| `EXPO_ACCESS_TOKEN` | Read through `readSecret` (`_FILE` honoured). |
| `PUSH_WORKER=off` | Keeps a process from starting the worker. |

`/api/health` fails in production with `log`, or with `expo` and no token. It
never calls Expo, so an Expo outage does not take the app down.

## Tables

| Table | What it holds |
| --- | --- |
| `push_devices` | One row per installation: token, platform, label, `token_version`, `session_id`, last seen and last sent. Ending that session removes the row |
| `push_preferences` | One row per person who changed a switch |
| `push_outbox` | Committed bell rows not yet handed to Expo, with the phones already reached |
| `push_tickets` | Accepted sends whose receipt is unread, with the token each went to |
| `push_kept_off` | Phones a person removed, kept off until turned on from the phone |

All five cascade from `users`. Account erasure clears them explicitly.

The local run and test flow is in
[docs/local-push-notifications.md](../../local-push-notifications.md).
