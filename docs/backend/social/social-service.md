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
  or joining a group through its invite link (acceptor ↔ inviter). Both
  sides of every friendship are people who signed up: nothing is created
  for an email or phone that belongs to nobody.
- A **friend request** is asymmetric and pending until the recipient acts.
  At most 100 unanswered requests are retained per recipient. Both sides see
  it while it pends: the recipient under `incoming_requests`, the sender
  under `outgoing_requests`, and the sender can withdraw it
  (`CancelFriendRequest`).
- "**Connected**" (the authorization set for adding people to groups and
  one-off expenses) is friendships ∪ co-membership — two people who met in
  somebody else's group can split without a request.
- Friend-request and friendship writes run under the **friend-request inbox
  advisory lock** of the affected recipients (sorted, before any user row
  locks), so accept/send races cannot recreate a just-consumed request.

## Privacy Invariants

- **AddFriend leaks deliberately more than nothing.** An email/phone that
  matches nobody is refused out loud (`FailedPrecondition`, and the clients
  offer the caller's own invite link instead), while an account gets a
  request — so the differing outcomes reveal whether an identifier has an
  account. A refusal the person can act on won that trade knowingly; among
  accounts, self/duplicate/pending/blocked stay indistinguishable, and the
  rate limit stands.
- A pending request's sender is shown through the minimal
  `toFriendRequestUser` projection — no contact info, payment handles,
  currency, or registration status until accepted.
- A pending request's **sender side** echoes only what the sender already
  knew: the email or phone they typed (kept on the request row as
  `recipient_identifier` for exactly this), or the same minimal projection
  of a recipient they picked by id or reached through a profile link. A
  typed identifier is never resolved back to a name, or AddFriend would
  become a reverse lookup.
- Activity is **audience-scoped at write time**: every event row carries the
  user ids allowed to see it, decided by the writer (expense participants,
  group members for structural events). Reads filter by audience; a group
  feed still only shows a member what their audiences allow.

## Contact Discovery

`FindContacts` deliberately reveals what AddFriend hides: which identifiers
from the caller's own address book belong to accounts. Only accounts that
said yes to `AuthService.SetContactDiscovery` take part; a phone matches only
once verified; deleted and suspended accounts, the caller and either block
direction never match. Nothing sent is stored or logged, and an unknown
number creates nothing. The one write is a per-account,
per-UTC-day count in `contact_lookup_usage`, claimed in the same transaction
as the match. See [Find friends from contacts](../../contact-discovery.md).

## Invite Links (§33)

Nobody is invited by email or phone: a person who has not signed up does not
exist here, and nothing is made for them. They are reached through a link
and sign up as themselves; accepting a link never claims or merges anything.

`invite_links` holds two kinds, each with one active link (regenerate =
revoke + recreate): **group** (one join link per group) and **profile**
(§33a — the owner's own "add me" link); `chk_invite_links_kind` refuses any
other. Tokens are 43-char random bearer credentials; every unusable token —
malformed, revoked, missing, its owner gone — gets one identical sentence,
so the endpoints scan as nothing. Delivery is the inviter's own share sheet;
the server sends no email or SMS.

**A group link works for 7 days** (`GROUP_INVITE_LINK_LIFETIME_DAYS` in
`@haalkhata/shared/invite/invite.constants`; `invite_links.expires_at`, which
`chk_invite_links_group_expiry` requires on every group link). A link that
escaped into a chat or a screenshot stops letting people in a week later.
Asking for the link again returns it unchanged until then, so sharing it
again never extends it; asking after it has run out revokes that one token
and mints a new link (two members asking at once both get the same new one,
since each revokes only the expired token). A link past its date answers
`FailedPrecondition`, "this invite link has expired", to anyone opening or
accepting it — still after a new link has replaced it — and the join pages
say so, with what to do. That tells the holder nothing they did not have; no
group, inviter or member count comes with it. A link the owner turned off
before its date keeps the generic `NotFound` sentence. Profile links only
send a friend request the owner confirms, and have no expiry.
Known residual: tokens ride in URLs, so they appear in front-proxy access
logs (operator-visible only); revocation is the remedy — the standard trade
every shareable-link product makes.

Until migration `1793040072450_retire-unregistered-people` there was a
third kind, **friend**: a link that claimed the placeholder row an inviter
had made for someone by email or phone, with its friendships and group
seats. Anyone who could add that email as a friend could mint one, so the
migration deleted every friend link and placeholder, and dropped
`invite_links.invited_user_id`. `GetFriendInviteLink` and
`InviteContactToSignUp` stay in the proto, deprecated, and are always
refused.

**The profile-kind asymmetry:** accepting a group link acts immediately (a
group join is visible to the whole roster and bounded by the group's size),
but accepting a profile link **sends an ordinary friend request** the owner
confirms from Friends. A leaked bearer link must not let a stranger attach
themselves — and future one-off expenses — to the owner; the link removes
the typing, not the consent.

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| AddFriend | 10/min per account |
| ListFriends | 60/min — **shares the `GetOverallBalances` bucket**, because it computes the same full-ledger aggregate; separate buckets would let one endpoint bypass the other's limit |
| SendReminder | 10/min per account, plus the 24 h per-pair cooldown |
| FindContacts | 5/min per account, at most 1,000 identifiers per call and 5,000 per account per UTC day (the daily count is durable, in Postgres) |
| SendFriendRequests | 20/min per account, at most 10 ids per call (the apps send one per Add) |
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
8. [GetFriendInviteLink](#8-getfriendinvitelink) *(retired)*
9. [CreateGroupInviteLink](#9-creategroupinvitelink)
10. [RevokeGroupInviteLink](#10-revokegroupinvitelink)
11. [PreviewInviteLink](#11-previewinvitelink)
12. [AcceptInviteLink](#12-acceptinvitelink)
13. [GetProfileInviteLink](#13-getprofileinvitelink)
14. [RevokeProfileInviteLink](#14-revokeprofileinvitelink)
15. [InviteContactToSignUp](#15-invitecontacttosignup) *(retired)*
16. [RemoveFriend](#16-removefriend)
17. [CancelFriendRequest](#17-cancelfriendrequest)
18. [FindContacts](#18-findcontacts)
19. [SendFriendRequests](#19-sendfriendrequests)

---

### 1. AddFriend

**Method:** `AddFriend`
**Route:** `POST /api/connect/social.v1.SocialService/AddFriend`

#### Notes

- **Exactly one identifier** of `user_id` / `email` / `phone` (E.164 or US
  national) — the clients present one "email or phone" field and route the
  raw string, so both being set means a client bug, and the server says so
  rather than guessing. The legacy `name` field is ignored.
- Malformed identifiers fail `InvalidArgument` with the format hint.
- **An account:** no friendship exists until the recipient accepts.
  The request insert and the recipient's `friend_request` notification
  commit together; a duplicate pending request inserts nothing and notifies
  nobody (no notification spam by re-sending). The typed email or phone is
  stored on the request row so ListFriends can echo it back to the sender;
  a `user_id` request stores nothing extra.
- **An email/phone that belongs to nobody:** refused with
  `FailedPrecondition` "they're not on HaalKhata yet — share your invite
  link so they can sign up", and **nothing is created**. Both apps answer it
  beside the form with the caller's own profile link
  (`NOT_ON_HAALKHATA_COPY.friend` in `@haalkhata/shared/invite/inviteCopy`).
- A `user_id` that names nobody (a stale picker, a deleted account) is a
  quiet empty success, like self, duplicate and blocked.

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
carries no target fields, so a success says nothing about who the account
is).

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
- `outgoing_requests` carries what the caller has sent and is still waiting
  on, oldest first. Each entry has exactly one of `user` (picked by id or
  via profile link, minimal projection) or `identifier` (the email or phone
  typed, echoed back).

#### Request

`google.protobuf.Empty`.

#### Response

**ListFriendsResponse:**

| Field | Type | Description |
| --- | --- | --- |
| friends | repeated CounterpartyBalance | Counterparties with balances, then zero-balance friends A→Z. |
| incoming_requests | repeated User | Pending senders (minimal projection). |
| outgoing_requests | repeated OutgoingFriendRequest | Sent and unanswered: `{user?, identifier, created_at}`, exactly one of user/identifier set. |

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
- `pending_friend_request_count` is the caller's unanswered incoming
  requests, for the Friends tab badge. It rides along here because clients
  already poll this call for the bell; ListFriends is the full-ledger
  aggregate and shares the balances rate limit, so it is the wrong thing to
  poll.
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
| pending_friend_request_count | int32 | Incoming friend requests awaiting the caller. |

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
- The notification **names how the sender wants to be paid** ("You owe
  $80.00. Pia prefers Zelle."), because "where do I send it?" is the next
  question and making the debtor ask defeats the reminder. It says "prefers"
  only of a starred method; with none starred it lists up to three that work
  in the currency ("takes bKash and Nagad"). Names only: a notification is a
  stored row, and an account number has no business outliving the debt. The
  debtor opens the settle dialog for the details. Amounts are named per
  currency.
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

- **Retired** with one-person invite links (see [Invite Links](#invite-links-33)).
  It returned a link that claimed the placeholder row made for somebody who
  had not signed up; no such row exists any more. It stays in the proto,
  marked deprecated, so an installed app that still calls it gets an answer
  it can show: always `FailedPrecondition` "invites for one person have been
  retired — update HaalKhata and share your own invite link or the group's
  link instead". Nothing is read or written.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | Ignored. |

#### Response

Never returns; always refused.

---

### 9. CreateGroupInviteLink

**Method:** `CreateGroupInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/CreateGroupInviteLink`

#### Notes

- The group's one active join link, minted on first ask. **Any member may**
  — the same trust level as adding people directly, and the accept side
  still records who invited whom.
- The link works for 7 days. Asking again returns the same link until then;
  after that, a new one (see [Invite Links](#invite-links-33)).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |

#### Response

**InviteLink:** `{ token, expires_at }` — `expires_at` (RFC 3339) is when
the link stops working, for the share dialog to say ("until Nov 4").

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
- Every dead shape — malformed, unknown, revoked, a profile link whose owner
  is gone — returns the identical `NotFound` sentence. A group link past its
  date returns `FailedPrecondition`, "this invite link has expired"; so does
  accepting it.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| token | string | From the shared URL. |

#### Response

**InvitePreview:**

| Field | Type | Description |
| --- | --- | --- |
| kind | string | `"group"` \| `"profile"`. |
| inviter_name | string | Who shared the link. |
| group_name / member_count | string / int32 | Group links only. |
| invited_name | string | **Deprecated** with one-person links; always empty. |

---

### 12. AcceptInviteLink

**Method:** `AcceptInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/AcceptInviteLink`

#### Notes

- Authenticated; 10/min per account. Safe to repeat.
- **Nothing is claimed or merged.** The caller joins as the account they
  signed in with; no link names another row to take over.
- **Group link:** enrols the caller under the group's ledger lock, befriends
  them with the inviter, and writes a `member_added` feed event ("joined via
  X's invite link") so a new face is explained. Already a member → quiet
  success.
- **Group link ceiling (§33b):** joins refuse at 100 members
  (`MAX_GROUP_MEMBERS`) — a leaked bearer link must not grow a roster
  without bound.
- **Profile link (§33a):** sends the owner an ordinary `friend_request`
  (with a notification saying the profile link was used) — never an instant
  friendship; see the asymmetry note above. Already friends or already
  requested → quiet success. The owner's own link is refused.
- A group join also sends the inviter an `invite_accepted` notification —
  the one moment an invite produces for its sender.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| token | string | From the shared URL. |

#### Response

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Set for group links, so the client can land there. |

---

### 13. GetProfileInviteLink

**Method:** `GetProfileInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/GetProfileInviteLink`

#### Notes

- The caller's own shareable "add me" link, minted on first ask — one
  active per person, the same token every time the share button is pressed.
- Accepting it goes through [AcceptInviteLink](#12-acceptinvitelink)'s
  profile branch: a friend request, not a friendship.

#### Request

`google.protobuf.Empty`.

#### Response

**InviteLink:** `{ token }`.

---

### 14. RevokeProfileInviteLink

**Method:** `RevokeProfileInviteLink`
**Route:** `POST /api/connect/social.v1.SocialService/RevokeProfileInviteLink`

#### Notes

- Disables the caller's profile link at once; the next ask mints a fresh
  one. The remedy when a link escaped further than intended.

#### Request

`google.protobuf.Empty`.

#### Response

`google.protobuf.Empty`.

---

### 15. InviteContactToSignUp

**Method:** `InviteContactToSignUp`
**Route:** `POST /api/connect/social.v1.SocialService/InviteContactToSignUp`

#### Notes

- **Retired.** It made a placeholder row for a contact who had not signed up
  and returned the link that claimed it. Nothing is made for such a person
  any more: the add forms answer an unknown email or phone with the group's
  join link ([CreateGroupInviteLink](#9-creategroupinvitelink)) or the
  caller's profile link ([GetProfileInviteLink](#13-getprofileinvitelink)).
  It stays in the proto, deprecated, and is always refused with
  `FailedPrecondition` (the same sentence as GetFriendInviteLink). Nothing
  is read or written.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| email | string | Ignored. |
| phone | string | Ignored. |

#### Response

Never returns; always refused.

---

### 16. RemoveFriend

**Method:** `RemoveFriend`
**Route:** `POST /api/connect/social.v1.SocialService/RemoveFriend`

#### Notes

- **Rate-limited:** 10/min per account.
- **The settled-balance gate (§37):** refused with `FailedPrecondition`
  while the pairwise net with that person is non-zero in ANY currency. The
  same rule group removal follows, and for the same reason: removing the
  row that makes somebody reachable must not orphan debt.
- **Atomic against money:** one transaction takes the pair's friend-request
  inbox locks (the order every friendship writer uses) and both participant
  ledger locks, so the zero check cannot race a concurrent one-off expense
  or settlement. Group writes need no serializing: a group debt lives with
  the group and both memberships either way.
- **What it touches:** both stored friendship directions and any pending
  friend requests between the pair. Shared history and group co-memberships
  are untouched.
- **Quiet by design**, like RemoveMember: no notification, no feed event.
  They can be re-added later through the normal request flow.
- `NotFound` when the target is not currently a friend.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The friend being removed. |

#### Response

`google.protobuf.Empty`.

---

### 17. CancelFriendRequest

**Method:** `CancelFriendRequest`
**Route:** `POST /api/connect/social.v1.SocialService/CancelFriendRequest`

#### Notes

- Withdraws a request the caller sent that is still pending. The request is
  named the way `ListFriends.outgoing_requests` showed it: `user_id` for a
  recipient the caller picked by id or reached through a profile link,
  `identifier` for a typed email or phone. Exactly one must be set
  (`InvalidArgument` otherwise), and the identifier path never resolves the
  account behind it, so cancelling cannot become a lookup either.
- **Atomic against acceptance:** the recipient is resolved, then the pair's
  friend-request inbox locks are taken (the order every friendship writer
  uses) before the delete. A concurrent accept therefore serializes with the
  cancel; whichever runs second finds no row and reports `NotFound`.
- **Quiet:** the recipient is not notified. Their earlier "sent you a friend
  request" notification stays in their feed but the request is simply no
  longer there to answer.
- `NotFound` when nothing pending matches, including a request answered a
  moment earlier.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The recipient, when the request was shown as a person. |
| identifier | string | The typed email or phone, when it was shown as one. |

#### Response

`google.protobuf.Empty`.

### 18. FindContacts

**Method:** `FindContacts`
**Route:** `POST /api/connect/social.v1.SocialService/FindContacts`

#### Notes

- Matches phones and emails from the caller's address book against
  accounts that have not turned discovery off
  (`users.contact_discovery IS NOT FALSE`: findable is the default, and NULL
  means never answered). Every live row is someone who signed up, and a
  deleted account's stand-in never matches. A phone needs
  `phone_verified_at`; an email matches the account's own sign-in email.
- Each entry is measured before it is parsed (over 254 characters is
  dropped), then normalised: phones must carry their country code (no region
  is guessed), emails are trimmed and lower-cased. Invalid entries are
  dropped, not refused, and duplicates count once.
- More than 1,000 entries is `InvalidArgument`. A lookup that would take the
  day past 5,000 is `ResourceExhausted` with how many are left; nothing is
  counted and no match runs. Quota claim and match share one transaction.
- One `FoundContact` per matched identifier, echoed exactly as sent, with the
  `toFriendRequestUser` projection and a `ContactRelation` (`INCOMING` wins
  when requests are pending both ways).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| phones | repeated string | E.164 numbers, normalised on the device. |
| emails | repeated string | Addresses, trimmed and lower-cased on the device. |

#### Response

| Field | Type | Description |
| --- | --- | --- |
| contacts | repeated FoundContact | `identifier`, `user` (id, name, avatar), `relation`. |
| remaining_today | int32 | Identifiers the caller can still check today (UTC). |

### 19. SendFriendRequests

**Method:** `SendFriendRequests`
**Route:** `POST /api/connect/social.v1.SocialService/SendFriendRequests`

#### Notes

- One request to each listed account that is live, findable from
  contacts (not turned off), not blocked either way, not already a friend, and has no request
  pending in either direction. Everyone else is skipped without saying so.
- Restricting it to findable accounts keeps the bulk path from being a
  faster AddFriend for ids learned elsewhere.
- Requests and their `friend_request` notifications commit in one
  transaction under the recipients' inbox locks; only inserted rows are
  notified, and the 100-pending cap per recipient holds.
- No `recipient_identifier` is stored: the sender saw who they were asking,
  so `outgoing_requests` shows the recipient's profile.
- An empty list or more than 10 ids is `InvalidArgument`.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_ids | repeated string | 1 to 50 account ids, normally from FindContacts. |

#### Response

`google.protobuf.Empty`.
