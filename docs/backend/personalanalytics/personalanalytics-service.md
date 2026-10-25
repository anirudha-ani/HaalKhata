# Personal Analytics Service (`personalanalytics.v1.PersonalAnalyticsService`)

A person's own activity, aggregated: what they spent, with whom, how they
split it, and how long they have been at it. It backs the Insights view of
the Activity screen on web and mobile.

The Personal Analytics Service is essential for:

- **One read per dashboard:** every figure the Insights view shows arrives in
  a single response, so a phone renders it from one round trip.
- **Counting where the ledger lives:** the server aggregates in SQL. The
  alternative, shipping a person's whole history to their device to add it up
  there, would be slower, would cost more data, and would put the arithmetic
  in two clients.

Nothing is stored. There is no analytics table, no event stream and no
tracking: every call counts the caller's existing expense and payment rows.
The one exception is the receipt-scan count, which reads the `receipt_scans`
tally the Receipt Service writes (see
[receipt-service.md](../receipt/receipt-service.md)).

Implementation: [handler.ts](../../../apps/web/src/server/personalanalytics/handler.ts)
→ [insights.usecase.ts](../../../apps/web/src/server/personalanalytics/usecase/insights.usecase.ts)
→ [insights.repo.ts](../../../apps/web/src/server/personalanalytics/repo/insights.repo.ts),
with the calendar math in
[domain/insightWindow.ts](../../../apps/web/src/server/personalanalytics/domain/insightWindow.ts)
and the per-currency assembly in
[domain/currencyInsights.ts](../../../apps/web/src/server/personalanalytics/domain/currencyInsights.ts).

---

## What a Caller Can See

Only their own side of their own ledger. There is no authorization decision
beyond "who is asking": the request carries no user id, and every statement
starts from the caller's own `expense_splits` and `expense_payers` rows. A
query here cannot reach an expense the caller is not on, so it cannot be
asked about anyone else.

The people listed under "who you split with" are the other participants of
those same expenses, each already visible to the caller on the expense
itself. Only what an avatar and a link need is returned for them: id, name,
avatar colour and picture. No contact detail and no payment handle.
Someone the caller blocked, or who blocked the caller, is left off the list,
as the activity feed leaves out their lines in both directions; the
expenses still count toward every figure.

## Two Figures, Not One

| Figure | Meaning | Source |
| --- | --- | --- |
| `share_cents` | What the caller actually spent: their share of each expense, whoever paid at the counter. | `expense_splits.owed_cents` |
| `paid_cents` | What the caller paid up front, their own share included. | `expense_payers.amount_cents` |

Someone who fronts a dinner for four has spent a quarter of it and paid all
of it. The dashboard charts the first and states the second.

## The Window

- A trailing run of **whole calendar months** ending in the caller's current
  month: `months` in the request, default 6, clamped to 1..24.
- Expenses are bucketed by **`expense_date`**, the calendar day the person
  chose, which is stored as `YYYY-MM-DD` text. The window is therefore a
  plain text range and needs no timezone.
- "This month" is the caller's, not the server's. The server's clock is UTC,
  where a month turns over up to 12 hours before or 14 hours after it does on
  the caller's wall; without correction the newest bar would be an empty
  month they have not reached yet, for a few hours every month. The client
  sends `local_month`, and it is believed **only when some real timezone is
  in that month right now**. A malformed or stale value changes nothing.
- Payments record a UTC instant, not a chosen day, so the window opens for
  them at the UTC start of its first month.
- `journey` is the one part of the response the window does not bound.

## Money Rules

- **Per currency, never summed across.** `currencies` has one entry per
  currency the caller spent or settled in, their default currency first.
  How the expenses were split, with whom and where are counted inside each
  entry too: the dashboard shows one currency at a time, and a list that
  counted every currency would contradict the charts beside it.
- Every money total passes through `toInt32Cents()` before it reaches the
  wire, so an overflow is a `FailedPrecondition`, not an encoder crash.
- Soft-deleted expenses and removed payments count nowhere. A net
  settlement's cancelling (`offset`) entries are not payments. The journey's
  payment count counts a payment once however many balances it settled
  (its rows are grouped by `PAYMENT_KEY`); the amounts paid and received
  add up every row, which is the same money either way.

## Consistency and Cost

- **Four statements per call, whatever the size of the history:** lifetime
  figures, the window's spending, the people split with, and payments. There
  is no query per row anywhere.
- The window's spending is read **once**, grouped by currency, month,
  category, split type and group, and regrouped in the domain layer into the
  monthly chart, the category list, the split-type list and the list of
  places. Those are four views of the same rows; four queries would walk the
  caller's split and payer history four times.
- The statements run one at a time inside one `snapshot()` (REPEATABLE READ,
  READ ONLY), so the total at the top of the dashboard always equals the
  months charted beneath it.
- Every statement is driven from `idx_splits_user` and `idx_payers_user` and
  joins `expenses` by primary key: the cost follows the size of the caller's
  own history, not the size of the table.

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| GetInsights | 30/min per account |

---

## Overview of Endpoints

1. [GetInsights](#1-getinsights)

---

### 1. GetInsights

**Method:** `GetInsights`
**Route:** `POST /api/connect/personalanalytics.v1.PersonalAnalyticsService/GetInsights`

#### Notes

- Authenticated like every app RPC (session cookie or bearer token).
- Someone with no history gets an empty dashboard, not an error: zeroed
  `journey` counts, a full list of `months`, and empty lists.
- `Unauthenticated` when the account row no longer exists.

#### Request

**GetInsightsRequest:**

| Field | Type | Description |
| --- | --- | --- |
| months | int32 | Window size in calendar months, the current one included. `0` = default (6); clamped to 1..24. |
| local_month | string | The caller's current month, `YYYY-MM`. Believed only when a real timezone is in that month now; otherwise the UTC month is used. |

#### Response

**GetInsightsResponse:**

| Field | Type | Description |
| --- | --- | --- |
| journey | Journey | Lifetime figures (below). Not bounded by the window. |
| months | repeated string | The window's months, `YYYY-MM`, oldest first, no gaps. Every per-month list has one entry per month here, zeros included. |
| currencies | repeated CurrencyInsights | One block per currency, default first, then by spending. |

Fields 4 to 6 (`split_types`, `companions`, `groups`) are reserved: they
counted every currency together and now live in each `CurrencyInsights`.

**GroupActivity:**

| Field | Type | Description |
| --- | --- | --- |
| group_id | string | Empty for expenses outside any group. |
| name | string | The group's name; empty outside any group. |
| type | string | The group's type; empty outside any group. |
| expense_count | int32 | The caller's expenses there in the window. |
| is_member | bool | Whether the caller still belongs to the group. Expenses in a group they have left are still counted, but clients must not link to a page that is closed to them. |

**Journey:**

| Field | Type | Description |
| --- | --- | --- |
| member_since | string | RFC 3339 instant the caller finished signing up (not when a friend first invited them). |
| first_expense_date | string | Earliest `YYYY-MM-DD` of a live expense they are on; empty when none. |
| expense_count | int32 | Live expenses they paid for or owe a share of. |
| payment_count | int32 | Payments they made or received, each once however many balances it settled. |
| group_count | int32 | Groups they belong to. |
| friend_count | int32 | Their friends, invited ones included. |
| receipt_scan_count | int32 | Receipts they scanned that a provider could read. Counted from the day scan counting shipped. |

**CurrencyInsights:**

| Field | Type | Description |
| --- | --- | --- |
| currency | string | ISO 4217 code. |
| share_cents | int32 | The caller's share over the window. |
| paid_cents | int32 | What they paid up front over the window. |
| monthly_share_cents | repeated int32 | `share_cents` per month of `months`. |
| categories | repeated CategorySpending | `share_cents` by expense category, largest first. |
| settled_out_cents | int32 | Payments they made during the window. |
| settled_in_cents | int32 | Payments they received during the window. |
| split_types | repeated SplitTypeCount | How the window's expenses in this currency were split, most used first. |
| companions | repeated Companion | The five people the caller shared the most expenses in this currency with. |
| groups | repeated GroupActivity | The five busiest places for this currency; an empty `group_id` is the row for expenses outside any group. |
