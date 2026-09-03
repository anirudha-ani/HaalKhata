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
  by: accepting a friend request, being added to a group together (the adder
  ↔ the added), sharing a one-off expense (the creator ↔ each participant),
  inviting an unregistered contact (§33 — immediate, since nobody exists to
  accept), or accepting an invite link (acceptor ↔ inviter).
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

- **AddFriend leaks less than it used to, deliberately more than nothing.**
  Since §33, an email/phone matching nobody creates an Invited row and an
  immediate friendship (there is nobody to accept), while registered targets
  keep the request flow — so the differing outcomes reveal whether an
  identifier has an account. Frictionless inviting won that trade knowingly;
  within the registered flow, self/duplicate/pending stay indistinguishable,
  and the rate limit stands.
- A pending request's sender is shown through the minimal
  `toFriendRequestUser` projection — no contact info, payment handles,
  currency, or registration status until accepted.
- Activity is **audience-scoped at write time**: every event row carries the
  user ids allowed to see it, decided by the writer (expense participants,
  group members for structural events). Reads filter by audience; a group
  feed still only shows a member what their audiences allow.

## Invite Links (§33)

A person without an account appears as **Invited** (`registered: false`) and
can be part of **no transaction** — the expense service refuses unregistered
participants by name. That one rule is what makes a bearer link safe to
share: claiming an invite moves friendships and group memberships onto the
acceptor's account (via the §32 merge machinery, whose money invariant holds
trivially at zero), never money.

`invite_links` holds two kinds, each with one active link (regenerate =
revoke + recreate): **friend** (inviter + the Invited row it claims) and
**group** (one join link per group). Tokens are 43-char random bearer
credentials; every unusable token — malformed, revoked, missing, already
claimed — gets one identical sentence, so the endpoints scan as nothing.
Delivery is the inviter's own share sheet; the server sends no email or SMS.

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
8. [GetFriendInviteLink](#8-getfriendinvitelink)
9. [CreateGroupInviteLink](#9-creategroupinvitelink)
10. [RevokeGroupInviteLink](#10-revokegroupinvitelink)
11. [PreviewInviteLink](#11-previewinvitelink)
12. [AcceptInviteLink](#12-acceptinvitelink)

---

### 1. AddFriend

**Method:** `AddFriend`
**Route:** `POST /api/connect/social.v1.SocialService/AddFriend`

#### Notes

- **Exactly one identifier** of `user_id` / `email` / `phone` (E.164 or US
  national) — the clients present one "email or phone" field and route the
  raw string, so both being set means a client bug, and the server says so
  rather than guessing. The legacy `name` field is ignored.
- Malformed identifiers are the only user-visible failures
  (`InvalidArgument` with the format hint).
- **Registered targets:** no friendship exists until the recipient accepts.
  The request insert and the recipient's `friend_request` notification
  commit together; a duplicate pending request inserts nothing and notifies
  nobody (no notification spam by re-sending).
- **Unmatched email/phone (§33):** the Invited row is created on the spot
  with an immediate two-way friendship — there is nobody to accept, and the
  row can hold no transactions, so it is a contact-book entry until claimed.
  The person appears as "Invited" on the caller's next friends refetch.
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

---

### 8. GetFriendInviteLink

**Method:** `GetFriendInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/GetFriendInviteLink`

#### Notes

- Returns the Invited person's active reminder link, minting it on first ask
  (one active link per (inviter, invited) pair; a concurrent ask re-reads
  the unique-index winner).
- **Authorization:** the target must be *unregistered* (a registered person
  signs in, they don't need a claiming link) and *connected* to the caller —
  their friend or a co-member — so a bare user id cannot mint a link that
  claims somebody else's invitation.
- Clients compose the URL as `https://haalkhata.app/join/<token>` and hand
  it to the OS share sheet; the server never builds URLs.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The Invited person the link reminds. |

#### Response

**InviteLink:** `{ token }`.

---

### 9. CreateGroupInviteLink

**Method:** `CreateGroupInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/CreateGroupInviteLink`

#### Notes

- The group's one active join link, minted on first ask. **Any member may**
  — the same trust level as adding people directly, and the accept side
  still records who invited whom.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |

#### Response

**InviteLink:** `{ token }`.

---

### 10. RevokeGroupInviteLink

**Method:** `RevokeGroupInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/RevokeGroupInviteLink`

#### Notes

- Disables the group's active link at once; a fresh one can be created
  after. **Owner only:** revocation invalidates a link every member may
  have shared — the destructive direction, drawn where member removal is.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |

#### Response

`google.protobuf.Empty`.

---

### 11. PreviewInviteLink

**Method:** `PreviewInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/PreviewInviteLink`

#### Notes

- **UNAUTHENTICATED** — the landing page must say "Anirudha invited you to
  Bali Trip" *before* asking anyone to create an account. Possession of the
  unguessable token is the credential; 30/min per client IP keeps the
  endpoint from being a scanning surface.
- Every dead shape — malformed, unknown, revoked, an invitation already
  claimed — returns the identical `NotFound` sentence.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| token | string | From the shared URL. |

#### Response

**InvitePreview:**

| Field | Type | Description |
| --- | --- | --- |
| kind | string | `"friend"` \| `"group"`. |
| inviter_name | string | Who shared the link. |
| group_name / member_count | string / int32 | Group links only. |
| invited_name | string | Friend links: the name the invite was created under. |

---

### 12. AcceptInviteLink

**Method:** `AcceptInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/AcceptInviteLink`

#### Notes

- Authenticated; 10/min per account. Safe to repeat.
- **Friend link:** the still-unclaimed invited identity is merged into the
  caller (friendships and group memberships ride along; no money can exist
  on it), its reminder links are revoked, and caller ↔ inviter are
  befriended. A caller who already claimed the row by email match skips the
  merge; an identity claimed by somebody else is a dead link; the inviter's
  own link is refused.
- **Group link:** enrols the caller under the group's ledger lock, befriends
  them with the inviter, and writes a `member_added` feed event ("joined via
  X's invite link") so a new face is explained. Already a member → quiet
  success.
- Either way the inviter gets an `invite_accepted` notification — the one
  moment an invite produces for its sender.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| token | string | From the shared URL. |

#### Response

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Set for group links, so the client can land there. |
