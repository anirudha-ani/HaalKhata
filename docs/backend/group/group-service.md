# Group Service (`group.v1.GroupService`)

Groups: shared ledgers with a member roster, an owner, one currency, and a
debt-routing mode, and a lifecycle status.

The Group Service is essential for:

- **Shared ledgers:** a group is the scope most expenses live in; its
  currency is the currency of every expense and settlement inside it.
- **Membership:** who may be put on a group expense, and who hears the
  group's feed events.
- **Consent boundaries:** who may add people, who may remove them, and the
  zero-balance gate that keeps removal from erasing debt.
- **Debt routing:** the per-group simplify-debts switch that changes which
  payments the whole system proposes and accepts.

Implementation: [handler.ts](../../../apps/web/src/server/group/handler.ts) →
[group.usecase.ts](../../../apps/web/src/server/group/usecase/group.usecase.ts),
SQL in [groups.repo.ts](../../../apps/web/src/server/group/repo/groups.repo.ts).

---

## The Authorization Model

| Action | Who may | Why drawn there |
| --- | --- | --- |
| Create a group | anyone | Creator becomes `owner`. |
| Read (`GetGroup`, `ListGroups`, feed, balances) | members only | |
| Add members | **any member** | A group is a shared ledger; whoever notices somebody is missing from the dinner is rarely the person who happened to create the group. |
| Remove somebody else | owner only | The destructive direction — and still gated on a settled balance. |
| Remove yourself | any non-owner member | Membership is consensual only if the person a co-member enrolled can walk out again. Same zero-balance gate. |
| Transfer ownership | owner only | Also how an owner leaves: hand the role on, become an ordinary member, then leave like anyone else. |
| Archive / unarchive | **any member** | Archiving requires every participant to be settled in every currency; unarchiving restores money writes. |
| Flip simplify-debts | **any member** | Same trust level as adding people: a routing mode over fully derived balances — rewrites nothing, always reversible. |

**Who may be added (§33c): connected people who signed up.** A group seat
belongs to somebody who can actually open the app. A bare user id is not
authorization (a stranger's id would be enough to enrol them and start
attributing debts to them), and an email/phone that belongs to **nobody**
refuses with a distinct `failed_precondition` ("they're not on HaalKhata
yet — share this group's invite link so they can join") that the clients
answer with the group's own join link (`NOT_ON_HAALKHATA_COPY.group`).
Nothing is created for that person; they sign up through the link as
themselves. A Deleted member (the stand-in account deletion leaves) is
refused by name inside `enrollMembers` — where CreateGroup and AddMembers
converge — so it never takes a new seat. A stranger's consent path, whether
or not they have signed up yet, is the group's join link. The connected set includes co-members, not just friends,
because two people who met in somebody else's group have no friendship row
yet would still be offered to each other in the picker.

**The zero-balance removal gate:** a member can only be removed (or leave)
when their net in the group is exactly zero **in every currency it holds**.
Removing someone who owes—or is owed—would orphan derived debt. A group can
hold a payment in a currency other than its own (written before 30 August
2026, when a cross-scope payment took the payment's currency into every
scope), and a dollar owed with a euro paid back is two open balances, not a
zero (audit A20; `mixedCurrencyGroup.integration.test.ts`). Clients explain
the refusal with every amount (`memberRemovalBlock`).

## Consistency

Every roster or mode mutation runs in one transaction under the
**group-ledger advisory lock** (`ledger:group:<id>`): a settlement being
validated in the group re-checks membership under the same lock, so it sees
the roster either before or after a whole batch add, never mid-batch. The
mutation, the friendships it implies, the activity event announcing it, and
the notifications all commit together — a group that exists with half its
members and no announcement is what a retry would then create twice.

## Feed & Notification Fan-out

| Mutation | Activity event (audience) | Notification |
| --- | --- | --- |
| CreateGroup | `group_created` → creator + everyone enrolled at creation | `added_to_group` to each added person |
| AddMembers | one `member_added` naming the whole batch → all members | `added_to_group` to each added person |
| TransferOwnership | `ownership_transferred` → all members | `ownership_transferred` to the new owner |
| SetSimplifyDebts | `simplify_debts` → all members (skipped on a no-op) | — |
| RemoveMember | — | — |

One event per batch, not one per person: a feed that reports a single action
three times is noise.

## Vocabularies

| Value set | Values | Fallback |
| --- | --- | --- |
| Group `type` | `trip` \| `home` \| `couple` \| `other` | unrecognized → `other` |
| Member `role` | `owner` \| `member` | exactly one owner per group |
| Limits | name ≤ shared `MAX_GROUP_NAME_LENGTH`; ≤ **100** member identifiers per create/add request | |

---

## Overview of Endpoints

1. [CreateGroup](#1-creategroup)
2. [ListGroups](#2-listgroups)
3. [GetGroup](#3-getgroup)
4. [AddMembers](#4-addmembers)
5. [RemoveMember](#5-removemember)
6. [TransferOwnership](#6-transferownership)
7. [SetSimplifyDebts](#7-setsimplifydebts)
8. [SetStatus](#8-setstatus)

---

### 1. CreateGroup

**Method:** `CreateGroup`
**Route:** `POST /api/connect/group.v1.GroupService/CreateGroup`

#### Notes

- **Validation:** name required (trimmed, bounded); type coerced to `other`
  when unrecognized; currency falls back to the creator's default currency,
  then `"USD"`, and is validated against the ISO 4217 catalog (§36). ≤ 100
  member ids.
- **The currency is declared here and frozen.** No endpoint (or SQL path)
  changes a group's currency after creation: every expense, settlement, and
  derived balance in the group is denominated in it, so changing it would
  silently re-denominate history. The clients say so beside the picker.
- **Born populated:** `member_ids` enrols people alongside the creator in the
  same transaction, under the same connected-people authorization as
  AddMembers — checked *before* the insert, so a rejected member list leaves
  no orphan group behind.
- Everyone enrolled at creation is in the `group_created` event's audience,
  so a group appearing in their list is explained by their feed. There is no
  separate "added" event at creation — the two are the same act.
- Enrolment also befriends the creator with each added person (one-off
  expenses between them become possible immediately). The whole batch —
  memberships, friendships, the inbox locks they need, and pending requests
  cleared — takes the same few statements for a hundred people as for one
  (`insertMembers`, `insertFriendships`), so AddMembers holds the group's
  lock no longer for a crowd.
- **Not idempotent** (no `operation_id`): a retried create makes a second
  group. The clients disable the button; an empty duplicate group is an
  annoyance, not a money error.

#### Request

**CreateGroupRequest:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | Required. |
| type | string | `trip` \| `home` \| `couple` \| `other`. |
| currency | string | ISO 4217; empty = creator's default. |
| member_ids | repeated string | People to enrol alongside the creator (max 100); each must be connected to the creator. |

**Sample Request (JSON):**

```json
{ "name": "Bali Trip", "type": "trip", "currency": "USD", "memberIds": ["7a1b…", "9c2d…"] }
```

#### Response

**Group:**

| Field | Type | Description |
| --- | --- | --- |
| id | string | UUID. |
| name / type / currency | string | As stored. |
| created_by | string | Creator's user id (the owner). |
| created_at | string | ISO-8601 UTC. |
| members | repeated Member | `{ user (public projection), role }` for every member. |
| simplify_debts | bool | Starts false. |
| status | GroupStatus | Starts `ACTIVE`. `ARCHIVED` preserves history and rejects ledger changes; `DELETED` is reserved for a future soft-delete flow. |

---

### 2. ListGroups

**Method:** `ListGroups`
**Route:** `POST /api/connect/group.v1.GroupService/ListGroups`

#### Notes

- **Rate-limited:** 60/min per account (a full-ledger read).
- Includes active and archived groups. Both clients show separate Active groups
  and Archived groups pathways; expense selectors and dashboard highlights
  use only active groups. Expense-history filters retain archived groups.
- Newest first. Each entry carries the full member list, the member count,
  and **the caller's net position** in the group.
- The nets are computed by one batched SQL sum across all groups
  (`userNetInGroups`) rather than one ledger walk per group — nets are
  routing-independent, so the sum agrees with the ledger math.
- `your_net_cents` is int32-checked (`FailedPrecondition` when a balance
  exceeds what the wire can carry). It is the group's own currency only;
  `your_balances` has every currency the caller holds a balance in there,
  the group's first, and both apps read it (`yourGroupBuckets`).

#### Request

`google.protobuf.Empty`.

#### Response

**ListGroupsResponse:**

| Field | Type | Description |
| --- | --- | --- |
| groups | repeated GroupSummary | `{ group, member_count, your_net_cents, your_balances }`; net > 0 = the caller is owed in that group. `your_net_cents` is in the group's currency; `your_balances` is one amount per currency, only non-zero ones. |

---

### 3. GetGroup

**Method:** `GetGroup`
**Route:** `POST /api/connect/group.v1.GroupService/GetGroup`

#### Notes

- Members only (`PermissionDenied` otherwise); `NotFound` for a missing id.
- Returns the group with its full member list (public user projections).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |

#### Response

**Group** (as in CreateGroup).

---

### 4. AddMembers

**Method:** `AddMembers`
**Route:** `POST /api/connect/group.v1.GroupService/AddMembers`

#### Notes

- **Rate-limited:** 15/min per account. Any member may call.
- **Identifiers:** ids of connected people, plus at most one of
  `email`/`phone` naming an existing connected account (both set →
  `InvalidArgument`). The legacy `name` field is accepted and ignored —
  nothing is created here for anyone.
- **One deliberate oracle:** an email/phone that resolves to nobody is
  refused with `FailedPrecondition` (see above), so the client can offer
  the join link. One that resolves to somebody the caller isn't connected
  with gets the generic denial ("you can only add people you already share
  a friendship or a group with") and reveals nothing about who they are.
- **Skip, don't fail:** people already in the group are skipped so one stale
  checkbox cannot lose the other additions; only when *everybody* picked was
  already in does the call fail (`"they're already in this group"` /
  `"everybody you picked is already in this group"`), because silently
  reporting success would leave the modal looking like it worked.
- Runs under the group-ledger lock; the batch, the implied friendships (each
  added person is befriended with the caller), one `member_added` event
  naming them all, and the notifications commit together.
- An id with no user row (stale client state) is skipped, not an error — the
  authorization check already passed.

#### Request

**AddMembersRequest:**

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |
| user_ids | repeated string | Connected people, max 100. |
| email | string | At most one of email/phone; must resolve to an existing **connected** account. |
| phone | string | E.164 or US national. |
| name | string | Legacy; ignored. |

**Sample Request (JSON):**

```json
{ "groupId": "g-42…", "userIds": ["7a1b…"], "email": "tanvir@example.com", "phone": "", "name": "" }
```

#### Response

**AddMembersResponse:**

| Field | Type | Description |
| --- | --- | --- |
| added | repeated Member | Only the people this call actually added, as `role: "member"`. |

---

### 5. RemoveMember

**Method:** `RemoveMember`
**Route:** `POST /api/connect/group.v1.GroupService/RemoveMember`

#### Notes

- **Self-removal:** any member except the owner ("owners cannot leave until
  they make somebody else the owner"). **Removing others:** owner only.
- **Zero-balance gate:** refused with `InvalidArgument` while the member's
  net in the group is non-zero — "settle up first".
- Runs under the group-ledger lock, so the balance check cannot race an
  expense or settlement being written.
- No feed event or notification; removal is quiet by design.
- Removal does not erase the person from history: their past expenses and
  settlements in the group remain (and their name still resolves in reads).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |
| user_id | string | The member to remove (may be the caller). |

#### Response

`google.protobuf.Empty`.

---

### 6. TransferOwnership

**Method:** `TransferOwnership`
**Route:** `POST /api/connect/group.v1.GroupService/TransferOwnership`

#### Notes

- Current owner only. Target must be an existing member and not the caller.
- Both role updates (target → `owner`, caller → `member`) commit in one
  transaction under the group-ledger lock, with an `ownership_transferred`
  event to the whole group and a notification to the new owner.
- This is the release valve for the removal rules: "owners cannot remove
  themselves" would otherwise be a dead end.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |
| user_id | string | The member who becomes the owner. |

#### Response

**Group** — with members, reflecting the new roles.

---

### 7. SetSimplifyDebts

**Method:** `SetSimplifyDebts`
**Route:** `POST /api/connect/group.v1.GroupService/SetSimplifyDebts`

#### Notes

- Any member may flip it. It is a **routing mode over balances that stay
  fully derived** — flipping rewrites nothing and is always reversible.
- **Why it must be a shared group fact** (not a per-viewer view): the
  server's settlement guards follow the mode. Two debt routings live at once
  would let one debt be paid down twice — see
  [expense-service.md § Debt Routing](../expense/expense-service.md#debt-routing-simplify-debts).
- **Idempotent no-op:** setting the state the group is already in succeeds
  silently and skips the feed entry, so two members flipping it together
  cannot fail each other or produce duplicate announcements.
- The change is announced in the group feed (`simplify_debts` event) because
  it changes what everyone sees and which payments are accepted — it must
  not happen silently.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |
| simplify | bool | Desired state. |

#### Response

**Group** — with `simplify_debts` reflecting the (possibly unchanged) state.


---

### 8. SetStatus

**Method:** `SetStatus`
**Route:** `POST /api/connect/group.v1.GroupService/SetStatus`

**Request:** `{ "groupId": "…", "status": "GROUP_STATUS_ARCHIVED" }`
(`GROUP_STATUS_ACTIVE` restores the group).
**Response:** the updated `Group`, including members and `status`.

`GroupStatus` defines `UNSPECIFIED`, `ACTIVE`, `ARCHIVED`, and `DELETED`. The
RPC accepts only `ACTIVE` and `ARCHIVED`; unspecified, unknown, or deleted
requests return `invalid_argument`. `DELETED` is reserved for a future
deletion flow and cannot be used to bypass balance checks or revive a deleted
group. Deleted records are omitted from group lists and refuse ledger writes.

Postgres stores the lifecycle in its `group_status` enum. A new migration
converts the previous archive flag while preserving every group’s state; the
boolean column is then removed. Both clients use the generated protobuf enum.

Any member can archive or unarchive. Archiving checks the entire ledger under
its group advisory lock and requires every participant's net to be exactly
zero in every currency. Empty groups and debt cycles with zero member nets
qualify. A settled caller cannot archive a group while other members owe money.
Unsettled balances return `failed_precondition`; repeating the current state
is a no-op. Non-members are refused in both directions.

Archived history remains readable. Creating, updating or deleting expenses,
and recording or removing group payments, requires unarchiving first. Every
ledger mutation rechecks the archive state under the same lock, so a stale
expense form cannot reopen the balance after archiving commits. The clients
refresh group details and the shared group list after a state change.


On both clients, the archive button opens a popup. Unsettled groups explain
what must be paid, with a way to see balances; settled groups ask for
confirmation and explain that the group moves to Archived groups for every
member and disappears from expense selectors while preserving history.
No archive mutation is sent until that confirmation. Restoring a group also
asks for confirmation, and server refusals stay visible inside the popup.
