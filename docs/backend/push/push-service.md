# Push Service (`push.v1.PushService`)

This service manages the phones that receive a person's push notifications and
the categories they want. It also runs the dispatcher that turns committed bell
rows into pushes.

Every push is a copy of one in-app notification (a `notifications` row). The
bell stays the record, and a push is a courtesy on top of it. When a push is
skipped, delayed or lost, the bell still has the row.

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
| `RemoveDevice` | both | Removes the caller's own phone, otherwise `not_found`. The app calls it for itself before `LogOut`. |
| `SendTestPush` | both | Sends to the caller's own phone, bypassing the queue. A dead phone gives `failed_precondition` and is forgotten; an unreachable Expo gives `unavailable`. 3 a minute. |
| `GetPreferences` / `UpdatePreferences` | both | Five switches, read and replaced as a whole record. No row means all on. 30 writes a minute. |

### Registering a phone

1. Validate the Expo token shape, the installation id and the platform.
2. Strip invisible characters from the label and app version, and refuse abusive ones.
3. Upsert on `installation_id` under the caller's current `token_version`. A token held by another account moves to the caller.
4. Keep the 10 most recently seen phones per user.

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
`SKIP LOCKED` plus the lease keep them apart.

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
| `push_devices` | One row per installation: token, platform, label, `token_version`, last seen and last sent |
| `push_preferences` | One row per person who changed a switch |
| `push_outbox` | Committed bell rows not yet handed to Expo, with the phones already reached |
| `push_tickets` | Accepted sends whose receipt is unread, with the token each went to |

All four cascade from `users`. Erasure and merge clear them explicitly.

The local run and test flow is in
[docs/local-push-notifications.md](../../local-push-notifications.md).
