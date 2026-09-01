# Shared Types (`common.v1`)

Messages shared by every service, defined in
[proto/common/v1/common.proto](../../../proto/common/v1/common.proto). They
carry the privacy and money semantics the whole API relies on, so the rules
here are normative for every endpoint that returns them.

---

## User

A person. Users may be **shadow users** — created by an invitation (email or
phone) without ever signing in. They participate in expenses like anyone else
and claim the account (keeping their whole history) by signing in with the
same email, or by verifying the same phone number and merging.

| Field | Type | Description |
| --- | --- | --- |
| id | string | UUID. |
| email | string | **Private.** Populated only when the caller reads their own profile; empty in every group, expense, friend, activity and ledger response. |
| name | string | Display name. For shadow users, whatever the inviter typed (or a derived placeholder). |
| avatar_color | string | Deterministic accent color (e.g. `"#0f8a5f"`), hashed from the account's founding identifier, used for initials avatars. |
| default_currency | string | ISO 4217 code (e.g. `"USD"`, `"BDT"`). Governs which currency legacy single-number balance fields report. |
| registered | bool | True when the account has been claimed — a password **or** a linked Google account. False = an unclaimed invite. |
| phone | string | **Private.** E.164 (e.g. `"+14155552671"`); populated only for the caller's own profile. An account may have an email, a phone, or both. Sign-in is Google-only in production, so a phone *identifies and reaches* someone; it never authenticates them. |
| payment_handles | repeated PaymentHandle | Where this person wants to be paid. **Visible to anyone who shares an expense with them** — exactly who needs it, because settling happens in Venmo/Zelle/Cash App and this app only records that it happened. |
| onboarded | bool | Whether this person finished (or skipped) the first-run flow. Only ever meaningful about the caller themselves; always `false` on any other user, and clients must not read it off anyone else. |
| avatar_url | string | Google profile picture URL; empty for invited users and never guaranteed even for Google users. Clients must keep the initials-on-`avatar_color` rendering as the fallback. |

### Projections

The server maps `users` rows through exactly three shapes — see
[conventions.md § Privacy Projections](conventions.md#privacy-projections):
the caller's own profile (`toPrivateUser`: everything), other people
(`toPublicUser`: contact and onboarding cleared, handles kept), and pending
friend-request senders (`toFriendRequestUser`: identity fields only — no
handles, currency, or registration status until the request is accepted).

## PaymentHandle

One "pay me here" identifier: a Venmo username, a Zelle email or phone, a
`$cashtag`, a PayPal.Me name.

| Field | Type | Description |
| --- | --- | --- |
| method | string | A settlement method key: `venmo` \| `zelle` \| `cashapp` \| `paypal`. |
| handle | string | Stored **exactly as typed** — an opaque identifier, never normalized or validated as an address. Max 120 chars. |

## Debt

A pairwise directed debt.

| Field | Type | Description |
| --- | --- | --- |
| from_user_id | string | The debtor. |
| to_user_id | string | The creditor. |
| amount_cents | int32 | Always > 0 when emitted. |

## NetBalance

A user's net position within some scope.

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The user. |
| net_cents | int32 | Positive = they are owed; negative = they owe. |

## CurrencyAmount

One amount in one currency. **Balances are kept per currency and never added
across currencies** — a dollar and a euro are not the same cent, and nothing
in the system converts. Lists of these are ordered with the caller's default
currency first, then alphabetically.

| Field | Type | Description |
| --- | --- | --- |
| currency | string | ISO 4217 code. |
| cents | int32 | Signed; zero buckets are omitted rather than sent. |

## CounterpartyBalance

The caller's overall position against one person, across groups and one-off
expenses.

| Field | Type | Description |
| --- | --- | --- |
| user | User | The counterparty (public projection). |
| net_cents | int32 | **Legacy:** the position in the caller's default currency only; > 0 = they owe you. Kept for older clients. |
| balances | repeated CurrencyAmount | The whole picture: one entry per currency with anything outstanding; cents > 0 = they owe you that much of that currency. |

> **Gotcha:** `net_cents` is not "the total" — it is one currency's bucket.
> A counterparty can owe €50 while `net_cents` reads 0 because the caller's
> default currency is USD. New UI must read `balances`.
