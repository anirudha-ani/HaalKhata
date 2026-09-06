# Expense Service (`expense.v1.ExpenseService`)

Expenses, settlements, and every balance the product shows. All money is
integer cents in the expense's currency; splits always reconcile to the exact
total.

The Expense Service is essential for:

- **Recording expenses:** who paid what, who owes what, under five split
  types, with server-computed authoritative splits.
- **Recording settlements:** real-world payments that pay down derived debt,
  guarded so they can never exceed or double-count it.
- **Balances:** group balances, the overall dashboard, and the per-friend
  ledger — all derived from history on every read, never stored.
- **History that stays legible:** soft deletes, struck-through rows,
  comments, and a per-expense change history.

Implementation:
[handler.ts](../../../apps/web/src/server/expense/handler.ts) →
[expense.usecase.ts](../../../apps/web/src/server/expense/usecase/expense.usecase.ts)
(writes) and
[balance.usecase.ts](../../../apps/web/src/server/expense/usecase/balance.usecase.ts)
(reads), over pure math in
[domain/balances.ts](../../../apps/web/src/server/expense/domain/balances.ts),
[domain/settlementAllocation.ts](../../../apps/web/src/server/expense/domain/settlementAllocation.ts),
[domain/settledExpenses.ts](../../../apps/web/src/server/expense/domain/settledExpenses.ts).

---

## The Ledger Model

**Every cent of debt lives in exactly one scope** — a group, or a pair's
one-off ledger — and each scope's balance is derived from **only its own
rows**:

```
scope balance = pairwiseBalances( expenseDebts(each live expense), live settlements )
```

- `expenseDebts` turns one expense into deterministic debtor→creditor
  entries: each participant's net is paid − owed; debtors are matched
  greedily against creditors in sorted-user-id order, so the same expense
  always yields the same ledger.
- `pairwiseBalances` nets those debts against settlements and normalizes each
  pair to a single entry pointing in the positive direction.
- Everything runs **per currency**: a euro expense and a dollar payment never
  net against each other. A one-off pair therefore holds one slate *per
  currency*.

Nothing is ever stored as "a balance". Consequences:

- Deletes must be **soft** — removing a row would silently rewrite history
  everyone already acted on. A deleted expense stops counting toward every
  balance but stays visible (struck through); payments recorded against it
  stay on the ledger, so deleting a paid-for expense leaves the payer owed a
  refund, *with the row that explains why*.
- Edits are allowed even after a settlement in the scope: the derived balance
  simply rebalances against what was paid. `GetExpense.has_later_settlement`
  lets clients warn first.
- Settlements must be **allocated to scopes at write time** (see below);
  read-time allocation would re-route history whenever a new expense arrived.

## Debt Routing (Simplify Debts)

A group with `simplify_debts` on routes its debts as the **min-cash-flow
simplification** of member nets (greedy largest-creditor × largest-debtor,
deterministic tie-breaks, ≤ members−1 payments) instead of the raw pairwise
graph.

The invariant: **every question of the form "who owes whom in this group"
reads the same routed graph** — the balances tab, friend ledgers, the
dashboard, and the settlement guards. The moment a page proposes a payment
the guards reject (or the reverse), the same debt has two live routings, and
a debt with two routings can be paid down twice. This is why the mode is a
shared group fact any member may flip but nobody may view differently.

**Cancelling loops:** a pairwise ledger can hold edges while every net is
zero (A→B→C→A) — typically left behind by payments recorded while the group
simplified, after switching the mode off. That is not debt: paying one edge
would leave the payer owed elsewhere around the loop. The guards refuse to
settle such a group ("these debts cancel out around a loop… turn on Simplify
debts to clear the view") and cross-scope allocation skips it.

## Settlement Scope Allocation

A payment with an explicit `group_id` is recorded there (in the group's
currency — anything else is refused; relabelling would invent an exchange
rate). A payment **without** one pays down the pair's balances across scopes:

1. The server re-reads, under locks, where the payer actually owes the
   creditor (`owedByScope`) — each scope computed exactly the way its balance
   page computes it, routed per that scope's mode.
2. The client may narrow with `scope_group_ids` (the settle dialog's
   checkboxes; `""` names the one-off ledger; empty = every scope owed —
   which is also what older clients send, so the default and legacy behavior
   coincide). **The client chooses scopes, never amounts.**
3. Scopes in another currency: silently skipped when merely unselected, but
   an *explicitly selected* foreign-currency scope is refused by name.
4. The amount must not exceed the sum of selected scope debts (checked
   against the **sum**, never the pair's global net — scopes where the payer
   is owed point the other way and cannot absorb a payment).
5. `allocateSettlement` places the money deterministically: the one-off
   ledger first (the pair's direct account; group scopes are shared with
   others and should move only when the direct slate could not absorb the
   payment), then groups by largest debt, ties by id — **one stored
   settlement row per scope touched**.

This is why paying from the friends tab closes the group's balance too,
instead of leaving the group demanding money that already changed hands.

## Concurrency

Recording and deleting money runs under transaction-scoped advisory locks
(see [conventions.md § Advisory Ledger Locks](../common/conventions.md#advisory-ledger-locks)):

| Operation | Locks (in order) |
| --- | --- |
| CreateExpense (group) | group ledger; membership re-checked under the lock |
| CreateExpense (one-off) | one participant-ledger lock per participant |
| UpdateExpense / DeleteExpense | expense lock → participant or group locks |
| RecordSettlement | settlement pair lock → group locks (the explicit group, or **every** group either person belongs to for cross-scope) |
| DeleteSettlement | pair lock → its group's lock |

The over-settle guard is a read followed by writes; without the locks two
concurrent settlements (two tabs, two devices, the two scopes' pages) both
validate against debt the other is consuming. Under the pair lock the second
one waits, re-reads a ledger that already contains the first, and is refused
by the guards. The feed rows and notifications ride the same transaction —
they commit with the money or not at all.

## Idempotency

`CreateExpense` and `RecordSettlement` require `operation_id`
([conventions.md § Idempotent Operations](../common/conventions.md#idempotent-operations-operation_id)).
The claim is made **before any lock**, so a retry of a lost response replays
the stored result without waiting on ledgers it will not touch. For
settlements the replay matters doubly: a partial payment leaves debt behind,
so the over-settle guard alone could not catch the duplicate.
`UpdateExpense` ignores `operation_id` — it replaces the row it names and is
idempotent by nature. Deletes are idempotent too (a second delete finds
`deleted_at` set → `NotFound`).

## Authorization

| Action | Who may |
| --- | --- |
| Create in a group | any member; **every participant must be a member** (re-checked under the lock) |
| Create one-off | caller must be a participant; every other participant must be connected (friend or co-member) |
| Read / comment | group expense: any member; one-off: participants (creator, payer, or ower) |
| **Edit** | anyone **on** the expense (creator, payer, or ower) — each can see the mistake and is affected by it; group editors must still be members |
| **Delete** | the **creator only** — the destructive direction leaves nothing behind for others to check; must still be a member for group expenses |
| Record a settlement | either of the two people on it (`received` says which way the money moved) |
| Delete a settlement | either of the two people on it |

## Fan-out

Every money mutation writes one activity event and notifications **in its
transaction**:

| Mutation | Event type | Audience |
| --- | --- | --- |
| Create/Update/Delete expense | `expense_added` / `expense_updated` / `expense_deleted` | Participants + actor — **never the whole group**; a member not on the expense reads the ledger tabs, not a feed line about other people's dinner |
| AddComment | `comment` (quotes a 120-char preview, making comments searchable) | Participants + author |
| RecordSettlement | one `settlement` event **per stored portion**, in that portion's scope | The two people on it (the event's `credit_user_id` lets the feed render "you were paid" vs "you paid") |
| DeleteSettlement | `settlement_deleted` | The two people on it |

One-off expense creation also **auto-befriends** the caller with every other
participant (ledger locks first, then friendship inbox locks — the one global
order).

## Vocabularies & Limits

| Thing | Values / limit |
| --- | --- |
| `split_type` | `equal` \| `exact` \| `percent` \| `shares` \| `itemized` |
| `category` | the shared `CATEGORIES` list + legacy `lodging`, `other`; anything else → `general` |
| Settlement `method` | `venmo` \| `zelle` \| `cashapp` \| `paypal` \| `cash` \| `bank` \| `other`; unknown → `cash` |
| Participants / payers / items / split specs | ≤ 100 each; ≤ 100 assignees per item |
| Amount per expense/settlement | ≤ 2,000,000,000 cents |
| Text | description ≤ shared limit, notes, item names, comment, settlement note — all bounded by shared limits |
| `expense_date` | `YYYY-MM-DD`, must be a **real** calendar day; empty → server's UTC today (a backstop — the forms always send the user's local today) |
| List caps | expenses ≤ 500 rows, friend ledger ≤ 300 lines (display only — `truncated: true`; balances always read everything) |

---

## Overview of Endpoints

1. [CreateExpense](#1-createexpense)
2. [UpdateExpense](#2-updateexpense)
3. [ListExpenses](#3-listexpenses)
4. [GetExpense](#4-getexpense)
5. [DeleteExpense](#5-deleteexpense)
6. [AddComment](#6-addcomment)
7. [RecordSettlement](#7-recordsettlement)
8. [DeleteSettlement](#8-deletesettlement)
9. [GetGroupBalances](#9-getgroupbalances)
10. [GetOverallBalances](#10-getoverallbalances)
11. [GetFriendLedger](#11-getfriendledger)

---

### 1. CreateExpense

**Method:** `CreateExpense`
**Route:** `POST /api/connect/expense.v1.ExpenseService/CreateExpense`

#### Notes

- **Rate-limited** 30/min per account; **requires `operation_id`**.
- **Validation pipeline**, in cost order: shape checks (description, notes,
  split type, array caps) → scope resolution (group exists, caller is a
  member, currency = group's; one-off currency = request's or caller's
  default; allowlist-validated) → **authoritative split computation** →
  payer validation → participant authorization.
- **Splits are never trusted from the client.** The server recomputes them
  from the raw specification with the shared cent-exact calculators:
  - `equal`: the total divided across `split_specs` users, remainder cents
    distributed deterministically.
  - `exact`: `split_specs[].amount_cents` must sum to the total.
  - `percent`: `split_specs[].percent_bp` (basis points) must sum to 10000.
  - `shares`: proportional to `split_specs[].shares`.
  - `itemized`: per-item assignments (weighted); tax and tip are spread
    proportionally; the computed items+tax+tip total **must equal the stated
    `amount_cents`** or the request is refused with both numbers named.
- **Payers** must each be positive and sum exactly to the total (multi-payer
  supported).
- **Participants:** group expenses — every payer/ower must be a member,
  re-checked under the group lock (membership may change between validation
  and lock). One-offs — the caller must be on the expense, and every other
  participant must be connected (friend or co-member); unknown ids are
  `InvalidArgument`.
- One-off creation auto-befriends caller ↔ each participant in the same
  transaction.
- Fan-out: `expense_added` event + notifications to participants (not the
  actor), committed with the expense.

#### Request

**CreateExpenseRequest:**

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Empty = one-off. |
| description | string | Required. |
| amount_cents | int32 | The stated total; for `itemized` it must equal items+tax+tip. |
| currency | string | Ignored for group expenses (the group's wins); empty one-off = caller's default. |
| category | string | Unknown → `general`. |
| expense_date | string | `YYYY-MM-DD`; empty → today (UTC). |
| split_type | string | `equal` \| `exact` \| `percent` \| `shares` \| `itemized`. |
| notes | string | Optional. |
| payers | repeated Payer | `{user_id, amount_cents}`; must sum to the total. |
| split_specs | repeated SplitSpec | Per-participant input; only the field matching `split_type` is read. |
| items | repeated ExpenseItem | `itemized` only; ids may be empty. |
| tax_cents / tip_cents | int32 | `itemized` only. |
| operation_id | string | **Required.** Client UUID naming this attempt; same id on every retry. |

**Sample Request (JSON):**

```json
{
  "groupId": "g-42…",
  "description": "Dinner at Warung",
  "amountCents": 6009,
  "currency": "",
  "category": "food",
  "expenseDate": "2026-08-30",
  "splitType": "equal",
  "notes": "",
  "payers": [{ "userId": "1c9e…", "amountCents": 6009 }],
  "splitSpecs": [{ "userId": "1c9e…" }, { "userId": "7a1b…" }, { "userId": "9c2d…" }],
  "items": [],
  "taxCents": 0,
  "tipCents": 0,
  "operationId": "0d5c0e0e-6c1a-4f6e-9d1e-2f4b8a7c3d21"
}
```

#### Response

**Expense** — the stored row with server-computed `splits` (e.g. 2003/2003/
2003 for the sample), `payers`, `items`, `created_by`, `created_at`, and an
empty `deleted_at`. A replayed retry returns the expense the first attempt
created.

---

### 2. UpdateExpense

**Method:** `UpdateExpense`
**Route:** `POST /api/connect/expense.v1.ExpenseService/UpdateExpense`

#### Notes

- **Full replacement:** `expense` is a complete `CreateExpenseRequest`
  re-validated exactly like a create; the original creator is preserved.
  `operation_id` inside it is ignored.
- **Who:** anyone on the expense (see [Authorization](#authorization)).
- **Cannot move scopes:** a changed `group_id` is refused — "delete it and
  create it in the right group". A debt cannot silently jump ledgers.
- **Checked twice by design:** existence/edit-rights/scope are verified once
  before the expensive validation (fail fast, no locks) and again on the
  locked client (everything checked can change in between).
- **Allowed after a settlement:** the edit runs under the ledger locks so it
  cannot race the settlement, and the derived balance rebalances — whoever
  paid more than their corrected share is owed the difference. Clients warn
  using `has_later_settlement`.
- Locks: expense lock → group lock (+ locked membership re-check) or
  participant locks over the union of old and new participants.
- Fan-out: `expense_updated` to the (new) participants.
- Deleted expenses cannot be edited (`NotFound`).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| expense_id | string | |
| expense | CreateExpenseRequest | The full replacement. |

#### Response

**Expense** — the replaced row.

---

### 3. ListExpenses

**Method:** `ListExpenses`
**Route:** `POST /api/connect/expense.v1.ExpenseService/ListExpenses`

#### Notes

- **Rate-limited** 60/min. Scope: `group_id` (member-only), `with_user_id`
  (one-offs shared with that user), or neither (everything involving the
  caller).
- **Deleted rows are listed** (struck through by clients) — a payment made
  against a since-deleted expense keeps the row that explains it. Balance
  math reads its own deleted-excluded queries.
- **`settled_expense_ids`** — ids with *nothing pending for the caller*:
  - Settlements pay down a **scope's** balance, never a specific expense, so
    "settled" honestly means "the scope it lives in owes nothing involving
    you". A group expense qualifies when the caller's net in that group is
    zero; while the group still owes, none of its expenses are singled out.
  - A one-off qualifies when the caller's pair balance **in the expense's
    currency** with *every* other participant is zero.
  - A scope that nets to zero with no payment recorded (two expenses cancel)
    counts as settled — the badge answers "is anything still pending?", not
    "was a payment typed in?".
  - Viewer-relative, which is why it is a side list, not a field on Expense.
  - Deleted expenses are never "settled": nothing was pending from them.
- **Truncation:** ≥ 500 rows → newest 500 + `truncated: true`. Balances and
  settledness still read the whole ledger; only the display list is cut.
- `users` carries the public projection of everyone referenced (creators,
  payers, owers) so clients can render names without extra calls.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Exactly one of these, or both empty = all of the caller's expenses. |
| with_user_id | string | One-off expenses shared with this user. |

#### Response

**ListExpensesResponse:**

| Field | Type | Description |
| --- | --- | --- |
| expenses | repeated Expense | Newest first, capped for display. |
| users | repeated User | Everyone referenced. |
| settled_expense_ids | repeated string | See notes. |
| truncated | bool | True when older rows were cut. |

---

### 4. GetExpense

**Method:** `GetExpense`
**Route:** `POST /api/connect/expense.v1.ExpenseService/GetExpense`

#### Notes

- Access: group membership, or being a participant for one-offs. **Deleted
  expenses still have a page** — the feed line announcing the deletion links
  here, and the row explains any payment left behind.
- **`history`** is read from the activity feed (who added/updated/deleted,
  when), not stored on the expense — the feed already records every change,
  and a second source of truth would only be one that could disagree. It is
  deliberately a slim `ExpenseEvent` (actor/type/timestamp), not the social
  `ActivityEvent` — the pre-rendered message would repeat what is already on
  screen.
- **`settled_for_viewer`**: the same rule as `settled_expense_ids`, for this
  one expense — detail page and list row can never disagree.
- **`has_later_settlement`**: whether a payment postdates this expense in its
  scope; advisory, so clients can warn that an edit/delete will rebalance.
  In a pairwise group only payments between the expense's own participants
  count; a simplified group routes debt across everyone, so there any later
  payment might have been for it. Same answer for every viewer.
- Comments and history actors resolve through one batched user lookup;
  authors who no longer resolve are omitted rather than invented.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| expense_id | string | |

#### Response

**GetExpenseResponse:**

| Field | Type | Description |
| --- | --- | --- |
| expense | Expense | Including `deleted_at` when soft-deleted. |
| comments | repeated Comment | Oldest first, with public-projection authors. |
| users | repeated User | Everyone referenced by the expense. |
| history | repeated ExpenseEvent | `{actor, type, created_at}`, oldest first. |
| settled_for_viewer | bool | See notes. |
| has_later_settlement | bool | See notes. |

---

### 5. DeleteExpense

**Method:** `DeleteExpense`
**Route:** `POST /api/connect/expense.v1.ExpenseService/DeleteExpense`

#### Notes

- **Creator only** (and still a member, for group expenses).
- **Soft delete:** sets `deleted_at`; the row stays in lists and detail
  reads, contributes nothing to any balance, cannot be edited, is never
  reported settled — and **stays open to comments** ("why was this
  removed?" is the conversation the kept row exists to host).
- Payments already recorded against the scope are untouched: deleting a
  paid-for expense leaves the payer owed a refund, with the struck-through
  row explaining why.
- Runs under expense lock + scope locks so the deletion cannot race a
  settlement being validated against it. Fan-out: `expense_deleted` built
  from the stored contents.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| expense_id | string | |

#### Response

`google.protobuf.Empty`.

---

### 6. AddComment

**Method:** `AddComment`
**Route:** `POST /api/connect/expense.v1.ExpenseService/AddComment`

#### Notes

- Same access rule as reading. Body trimmed, non-empty, bounded by the
  shared comment limit. Deleted expenses accept comments.
- One transaction stores the comment, a `comment` activity event (audience:
  participants + author) **quoting a 120-char preview** — so comments are
  findable by content in the feed — and notifications to the other
  participants.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| expense_id | string | |
| body | string | Non-empty after trimming. |

#### Response

**Comment:** `{ id, expense_id, author (public User), body, created_at }`.

---

### 7. RecordSettlement

**Method:** `RecordSettlement`
**Route:** `POST /api/connect/expense.v1.ExpenseService/RecordSettlement`

#### Notes

- **Requires `operation_id`.** A retry of a lost response replays the first
  recording — never a second one, which the over-settle guard alone could
  not catch for a partial payment.
- **Direction:** `received: false` (default) = "I paid them"; `true` = "they
  paid me" (stored the other way round). Recording money coming back is the
  only way to clear a balance in your favour. Either person on a payment may
  record it; `recorded_by_user_id` preserves whose claim it is.
- **Validation (pre-lock):** not yourself; amount positive and bounded; note
  bounded; recipient exists; for a group — both people members, currency
  must be the group's.
- **Under the pair lock (+ group locks), re-validated:**
  - Group payment: membership re-checked; a **cancelling loop** refuses
    (see [Debt Routing](#debt-routing-simplify-debts)); the payer must owe
    the creditor along the group's routed graph, and the amount must not
    exceed it (both numbers named in the error).
  - Cross-scope payment: every shared group is locked first, then scopes
    where the payer owes are re-read server-side (a stale client selection
    cannot double-record); explicitly selected foreign-currency scopes are
    refused by name; the amount must not exceed the sum of the selected
    same-currency debts. `allocateSettlement` then stores **one row per
    scope** (one-off slate first, then largest group debt).
- **Fan-out:** one `settlement` activity event per stored portion in that
  portion's scope, visible only to the two people (with `credit_user_id` so
  each side's feed says "you were paid" vs "you paid"; "recorded by X" is
  appended when the recipient typed it in), plus one notification to the
  counterparty. All on the payment's transaction.
- Method falls back to `cash` when unrecognized. Empty currency = caller's
  default.

#### Request

**RecordSettlementRequest:**

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Explicit scope; empty = cross-scope allocation. |
| to_user_id | string | The other person, whichever way the money moved. |
| amount_cents | int32 | > 0, ≤ 2e9. |
| currency | string | Group payments: must be the group's. Cross-scope: which currency's balances this pays down; empty = caller's default. |
| method | string | `venmo` \| `zelle` \| `cashapp` \| `paypal` \| `cash` \| `bank` \| `other`. |
| note | string | Optional, bounded. |
| received | bool | True = they paid you. |
| scope_group_ids | repeated string | Cross-scope only: which scopes to pay down (`""` = the one-off ledger). Empty = every scope where the payer owes. |
| operation_id | string | **Required.** |

**Sample Request (JSON):**

```json
{
  "groupId": "",
  "toUserId": "7a1b…",
  "amountCents": 4000,
  "currency": "USD",
  "method": "venmo",
  "note": "August settle-up",
  "received": false,
  "scopeGroupIds": ["", "g-42…"],
  "operationId": "b3f2…-…"
}
```

#### Response

**Settlement** — the **first** stored row (a cross-scope payment stores one
per scope; callers only use the response to confirm the recording):

| Field | Type | Description |
| --- | --- | --- |
| id / group_id / from_user_id / to_user_id | string | Direction already normalized (`from` owes `to`). |
| amount_cents / currency / method / note | | This portion's slice. |
| created_at | string | ISO-8601 UTC. |
| recorded_by_user_id | string | Who typed it in — one of the two, not necessarily the payer. A payment is a claim; this says whose. |

---

### 8. DeleteSettlement

**Method:** `DeleteSettlement`
**Route:** `POST /api/connect/expense.v1.ExpenseService/DeleteSettlement`

#### Notes

- **Either of the two people on it** may remove a mistaken payment — both
  are affected, and the other is told.
- **Soft delete:** the line keeps its place in the friend ledger, struck
  through with a zero delta, and the debt it had paid down comes back
  exactly.
- Runs under the pair lock + the group's lock; existence is re-checked on
  the locked client. The `settlement_deleted` feed row (the only record of
  who removed it and when) and the notification commit with the removal.
- Note: this removes **one stored row**. A cross-scope payment recorded as
  several portions is several settlements; each is removed on its own.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| settlement_id | string | |

#### Response

`google.protobuf.Empty`.

---

### 9. GetGroupBalances

**Method:** `GetGroupBalances`
**Route:** `POST /api/connect/expense.v1.ExpenseService/GetGroupBalances`

#### Notes

- **Rate-limited** 60/min (rebuilds the group's whole ledger). Members only.
- Returns the balance **three ways** from one ledger walk: per-member nets
  (every member listed, settled ones at zero), the raw pairwise debts, and
  the min-cash-flow simplification — clients render whichever the group's
  mode calls for, and the settle dialog can show both.
- Every aggregate is int32-checked (`FailedPrecondition` names which number
  overflowed).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | |

#### Response

**BalancesResponse:**

| Field | Type | Description |
| --- | --- | --- |
| nets | repeated NetBalance | Sorted by user id; > 0 = owed. In the group's currency. |
| debts | repeated Debt | Raw pairwise: expenses minus settlements. |
| simplified | repeated Debt | Min-cash-flow over the same nets. |

---

### 10. GetOverallBalances

**Method:** `GetOverallBalances`
**Route:** `POST /api/connect/expense.v1.ExpenseService/GetOverallBalances`

#### Notes

- **Rate-limited** 60/min, sharing a bucket with `ListFriends` (which
  computes the same aggregate).
- **The dashboard number.** Per counterparty, the sum over each shared scope
  of that scope's balance between the pair — **routed the way that scope
  routes it**. A simplified group contributes its simplified edge (which can
  point at a member the caller never dealt with directly, and contribute
  nothing against someone their history says they owe — that debt was
  rerouted). It must be built from the same routed scopes the settlement
  guards check: a "you owe" no payment may pay down would be a contradiction
  on screen.
- Un-simplified scopes are computed in one linear pass over everything except
  simplified groups' rows (pairwise netting is linear, so the per-scope sums
  equal one pass); only simplified groups need their own ledger read.
- **Per currency throughout.** `totals` is one entry per currency with
  anything outstanding, the caller's default first; the scalar
  `you_owe_cents`/`owed_to_you_cents` are the default-currency bucket only
  (legacy).
- Counterparties are sorted by their largest single bucket (a display order —
  magnitudes across currencies are not comparable); those with nothing
  outstanding in any currency are omitted.

#### Request

`google.protobuf.Empty`.

#### Response

**OverallBalancesResponse:**

| Field | Type | Description |
| --- | --- | --- |
| you_owe_cents / owed_to_you_cents | int32 | Legacy: default currency only. |
| totals | repeated CurrencyTotals | `{currency, you_owe_cents, owed_to_you_cents}` per currency. |
| counterparties | repeated CounterpartyBalance | Per-person breakdown with per-currency `balances`. |

---

### 11. GetFriendLedger

**Method:** `GetFriendLedger`
**Route:** `POST /api/connect/expense.v1.ExpenseService/GetFriendLedger`

#### Notes

- **Rate-limited** 60/min (rebuilds the pair's whole shared history).
- **The statement with one person:** every expense both appear on (group
  ones included, the way Splitwise totals a friendship) and every settlement
  either way, merged oldest-first with a per-currency running balance, then
  returned newest-first for reading.
- Line rules: a line that moved nothing between the pair is dropped (noise);
  **deleted rows are the exception** — kept with `delta_cents: 0` and
  `deleted: true`, so a payment against a deleted expense, or a debt that
  returned when a payment was removed, keeps the row that explains it.
  Settlement lines carry `recorded_by_name` ("you", or the friend's name) —
  every payment is somebody's claim and the statement says whose.
- **Headline nets are routed, not raw:** per-scope balances follow each
  scope's routing mode (a simplified group contributes its routed edge —
  possibly zero while the pair's history is not, or vice versa;
  `group_balances[].simplified` lets the UI explain the difference). The
  headline is the sum of these rows — the same numbers the dashboard shows
  and the settlement guards enforce.
- `mutual_groups` lists every group both belong to **regardless of balance**
  — "where do I know this person from" is a different question from "where
  does money move".
- **No existence oracle:** an unknown id and an existing account with no
  friendship, mutual group, or shared history return the identical
  `NotFound` "friend ledger not found".
- Truncation: newest 300 lines + `truncated: true`; nets and group balances
  are computed over everything regardless.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The other person. |

#### Response

**FriendLedgerResponse:**

| Field | Type | Description |
| --- | --- | --- |
| friend | User | Public projection. |
| net_cents / currency | int32 / string | Legacy: net in the caller's default currency. |
| nets | repeated CurrencyAmount | Whole picture per currency; > 0 = they owe you. |
| entries | repeated FriendLedgerEntry | Newest first; `balance_after_cents` accumulated oldest-first so the top entry carries the current net (per currency). |
| group_balances | repeated FriendGroupBalance | Per-scope routed balances (`""` group = one-off slate, one entry per currency). |
| is_friend | bool | Whether an explicit friendship exists (the page also works for mutual group members and historical counterparties). |
| mutual_groups | repeated MutualGroup | Every shared group, settled ones included. |
| truncated | bool | True when older lines were cut. |

**FriendLedgerEntry** (signs always read "positive = in your favour"):

| Field | Type | Description |
| --- | --- | --- |
| kind | string | `expense` \| `settlement`. |
| id / date / description | | `date` is the calendar day (expense's chosen day; settlement's UTC day). |
| group_id / group_name | string | Empty = one-off. |
| total_cents | int32 | The whole expense, or the amount that changed hands. |
| delta_cents | int32 | What this line did to the balance; 0 for deleted lines. |
| balance_after_cents | int32 | Running balance in this line's currency. |
| created_at | string | Full timestamp for settlements (client localizes); empty for expenses. |
| deleted | bool | Struck-through line. |
| recorded_by_name | string | Settlements only: who asserted the payment. |
| currency | string | The column this line's running balance continues. |
