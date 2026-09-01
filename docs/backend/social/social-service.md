# Social Service (`social.v1.SocialService`)

Friends, the activity feed, in-app notifications, and payment reminders.

The Social Service is essential for:

- **The friend graph:** privacy-preserving requests, symmetric friendships,
  and the friends list the settle and split flows pick people from.
- **The activity feed:** the audience-scoped record of everything that
  happened — the same rows the expense detail view reads back as history.
- **Notifications:** the in-app inbox every fan-out writes to.
- **Reminders:** nudges that cannot become harassment.

Implementation: [handler.ts](../../../apps/web/src/server/social/handler.ts) →
[social.usecase.ts](../../../apps/web/src/server/social/usecase/social.usecase.ts),
SQL in [friendships.repo.ts](../../../apps/web/src/server/social/repo/friendships.repo.ts),
[activity.repo.ts](../../../apps/web/src/server/social/repo/activity.repo.ts),
[notifications.repo.ts](../../../apps/web/src/server/social/repo/notifications.repo.ts).

---

## The Friendship Model

- A **friendship** is symmetric (two rows, one per direction) and is created
  only by: accepting a friend request, being added to a group together (the
  adder ↔ the added), or sharing a one-off expense (the creator ↔ each
  participant).
- A **friend request** is asymmetric and pending until the recipient acts.
  At most 100 unanswered requests are retained per recipient.
- "**Connected**" (the authorization set for adding people to groups and
  one-off expenses) is friendships ∪ co-membership — two people who met in
  somebody else's group can split without a request.
- Friend-request and friendship writes run under the **friend-request inbox
  advisory lock** of the affected recipients (sorted, before any user row
  locks — the same order account merges use), so accept/send races cannot
  recreate a just-consumed request.

## Privacy Invariants

- **AddFriend is not an existence oracle.** Every syntactically valid lookup
  returns the same empty response — target missing, target is yourself,
  already friends, request already pending, or a request actually created
  are all indistinguishable to the caller. Only the recipient learns a real
  request exists (their private list + a notification).
- A pending request's sender is shown through the minimal
  `toFriendRequestUser` projection — no contact info, payment handles,
  currency, or registration status until accepted.
- Activity is **audience-scoped at write time**: every event row carries the
  user ids allowed to see it, decided by the writer (expense participants,
  group members for structural events). Reads filter by audience; a group
  feed still only shows a member what their audiences allow.

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| AddFriend | 10/min per account |
| ListFriends | 60/min — **shares the `GetOverallBalances` bucket**, because it computes the same full-ledger aggregate; separate buckets would let one endpoint bypass the other's limit |
| SendReminder | 10/min per account, plus the 24 h per-pair cooldown |
| Others | authentication only |

---

## Overview of Endpoints

1. [AddFriend](#1-addfriend)
2. [ListFriends](#2-listfriends)
3. [RespondFriendRequest](#3-respondfriendrequest)
4. [ListActivity](#4-listactivity)
5. [ListNotifications](#5-listnotifications)
6. [MarkNotificationsRead](#6-marknotificationsread)
7. [SendReminder](#7-sendreminder)

---

### 1. AddFriend

**Method:** `AddFriend`
**Route:** `POST /api/connect/social.v1.SocialService/AddFriend`

#### Notes

- **Exactly one identifier** of `user_id` / `email` / `phone` (E.164 or US
  national) — the clients present one "email or phone" field and route the
  raw string, so both being set means a client bug, and the server says so
  rather than guessing. The legacy `name` field is ignored (shadow users are
  never created here).
- Malformed identifiers are the only user-visible failures
  (`InvalidArgument` with the format hint).
- **No friendship exists until the recipient accepts.** The request insert
  and the recipient's `friend_request` notification commit together; a
  duplicate pending request inserts nothing and notifies nobody (no
  notification spam by re-sending).
- Merged-away accounts (tombstones) are treated as missing.

#### Request

**AddFriendRequest:**

| Field | Type | Description |
| --- | --- | --- |
| email | string | Exactly one of the three identifiers. |
| name | string | Legacy; ignored. |
| phone | string | E.164 or US national. |
| user_id | string | For requesting someone already on screen. |

#### Response

`common.v1.User` — **intentionally empty** (kept for wire compatibility; it
must carry no target fields, or it would answer "does this address have an
account?").

---

### 2. ListFriends

**Method:** `ListFriends`
**Route:** `POST /api/connect/social.v1.SocialService/ListFriends`

#### Notes

- Two-part list: expense **counterparties first** (with their per-currency
  balances, sorted by attention needed — the same data as
  `GetOverallBalances`), then remaining explicit friendships alphabetically
  at zero balance. So "friends" is really *friendships ∪ everyone you have
  live dealings with*.
- `incoming_requests` carries pending senders, visible only to this
  recipient, through the minimal projection (see Privacy Invariants).
  Senders merged away since requesting are dropped.

#### Request

`google.protobuf.Empty`.

#### Response

**ListFriendsResponse:**

| Field | Type | Description |
| --- | --- | --- |
| friends | repeated CounterpartyBalance | Counterparties with balances, then zero-balance friends A→Z. |
| incoming_requests | repeated User | Pending senders (minimal projection). |

---

### 3. RespondFriendRequest

**Method:** `RespondFriendRequest`
**Route:** `POST /api/connect/social.v1.SocialService/RespondFriendRequest`

#### Notes

- **Only the named recipient can act**; the request is looked up as
  (`user_id` → caller). Unknown, non-incoming, self, and already-consumed
  ids are all the same `NotFound` "friend request not found".
- One transaction (under the inbox locks): the request row is consumed
  either way; **accept** additionally creates both friendship rows and
  notifies the requester ("X accepted your friend request"); **decline**
  consumes it silently — the sender is never told.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The incoming request's sender. |
| accept | bool | True = befriend; false = decline. |

#### Response

`google.protobuf.Empty`.

---

### 4. ListActivity

**Method:** `ListActivity`
**Route:** `POST /api/connect/social.v1.SocialService/ListActivity`

#### Notes

- **Scopes:** empty `group_id` = the caller's personal feed (every event
  whose audience includes them); a `group_id` (member-only) narrows to that
  group — but the audience still governs visibility within it.
- **Keyset pagination:** `cursor` is an opaque `(created_at, id)` token from
  the previous page's `next_cursor` — rows inserted while paging cannot
  shift the window and duplicate or skip an entry (offset paging would).
  Cursor components are strictly validated (exact UTC-timestamp and UUID
  shapes).
- `limit` is clamped to 1–100 (default 25). `month` (`"YYYY-MM"`) restricts
  to one calendar month; `months` in the response lists only months that
  actually contain activity in this scope — and reflects the group scope but
  **not** the month filter, so the control never erases its own options.
- **`inbound`** (settlements only) is computed per viewer at read time — the
  same row is money arriving for one person and money leaving for the other,
  and without it the UI cannot tell "you were paid" from "you paid".
- Events whose actor no longer resolves are dropped. `link` is sanitized to
  a safe in-app path before being returned.
- Event types: `expense_added` / `expense_updated` / `expense_deleted` /
  `settlement` / `settlement_deleted` / `comment` / `member_added` /
  `group_created` / `ownership_transferred` / `simplify_debts`.

#### Request

**ListActivityRequest:**

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Empty = everything visible to the caller. |
| cursor | string | Opaque; empty starts at the newest event. |
| limit | int32 | Clamped to 1–100; 0 → 25. |
| month | string | `"YYYY-MM"`; empty = all time. |

#### Response

**ListActivityResponse:**

| Field | Type | Description |
| --- | --- | --- |
| events | repeated ActivityEvent | Newest first: `{id, group_id, actor (public User), type, message (pre-rendered), link, created_at, amount_cents, currency, inbound}`. |
| next_cursor | string | Pass back as `cursor`; empty when exhausted. |
| months | repeated string | Months with activity, newest first, for the filter control. |

---

### 5. ListNotifications

**Method:** `ListNotifications`
**Route:** `POST /api/connect/social.v1.SocialService/ListNotifications`

#### Notes

- The caller's newest notifications plus the unread count (computed
  separately, so it is correct even beyond the returned page).
- Notification types in use: `friend_request`, `added_to_group`,
  `ownership_transferred`, `expense_added|updated|deleted`, `comment`,
  `settlement`, `settlement_deleted`, `reminder`.

#### Request

`google.protobuf.Empty`.

#### Response

**ListNotificationsResponse:**

| Field | Type | Description |
| --- | --- | --- |
| notifications | repeated Notification | `{id, type, title, body, link, read, created_at}`. |
| unread_count | int32 | |

---

### 6. MarkNotificationsRead

**Method:** `MarkNotificationsRead`
**Route:** `POST /api/connect/social.v1.SocialService/MarkNotificationsRead`

#### Notes

- Marks **all** of the caller's notifications read. Idempotent; no per-item
  variant exists (the inbox is small and the gesture is "clear the badge").

#### Request / Response

`google.protobuf.Empty` both ways.

---

### 7. SendReminder

**Method:** `SendReminder`
**Route:** `POST /api/connect/social.v1.SocialService/SendReminder`

#### Notes

- Nudges someone who owes the caller, as an in-app notification. **Both
  guards are server-side because the sender is not the party who suffers
  when they are missing:**
  1. The debtor must currently owe the caller (per currency — a dollar owed
     is not cancelled by a euro owed the other way), on the same routed
     numbers the dashboard shows.
  2. **24 h cooldown per (sender, debtor) pair.** The previous reminder
     notification is itself the cooldown record — no extra table. The
     check-then-insert runs in one transaction under the
     `reminder:<sender>:<debtor>` advisory lock, otherwise ten concurrent
     sends all read "no previous reminder" before any commits.
- Ordering of the guards is deliberate: the cooldown (one indexed lookup)
  runs before the full ledger walk, so rejected spam is cheap.
- The notification **carries the sender's payment handles** ("pay via
  Venmo: @ani-p …") — "where do I send it?" is the next question, and making
  the debtor ask defeats the reminder. Amounts are named per currency.
- Errors: reminding yourself, a debtor who owes nothing, and a running
  cooldown (with hours remaining) are `InvalidArgument`; a vanished account
  is denied. Rate-limited 10/min on top of the cooldown.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The person to remind; must currently owe the caller. |

#### Response

`google.protobuf.Empty`.
