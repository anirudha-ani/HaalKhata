# Shared Types (`common.v1`)

Messages shared by every service, defined in
[proto/common/v1/common.proto](../../../proto/common/v1/common.proto). They
carry the privacy and money semantics the whole API relies on, so the rules
here are normative for every endpoint that returns them.

---

## User

A person who has signed up, or a **Deleted member** (`deleted: true`) that
stands in for an erased account in shared history. Nobody exists here before
signing up: adding someone by email or phone finds an account or creates
nothing, and no sign-in, phone verification or link ever claims or merges
one row into another.

| Field | Type | Description |
| --- | --- | --- |
| id | string | UUID. |
| email | string | **Private.** Populated only when the caller reads their own profile; empty in every group, expense, friend, activity and ledger response. |
| name | string | Display name; "Deleted member" for a stand-in. |
| avatar_color | string | Deterministic accent color (e.g. `"#0f8a5f"`), hashed from the account's founding identifier, used for initials avatars. |
| default_currency | string | ISO 4217 code (e.g. `"USD"`, `"BDT"`). Governs which currency legacy single-number balance fields report. |
| registered | bool | True for every account — a password **or** a linked Google/Apple account, which `chk_users_can_sign_in` requires of every live row. False only on a Deleted member; pickers show those disabled ("deleted their account"). |
| phone | string | **Private.** E.164 (e.g. `"+14155552671"`); populated only for the caller's own profile. An account may have an email, a phone, or both. Sign-in uses Google or Apple in production, so a phone *identifies and reaches* someone; it never authenticates them. |
| payment_handles | repeated PaymentHandle | **Retired, always empty.** Where a person wants to be paid is now a list of payment methods they define ([payment-service.md](../payment/payment-service.md)). It no longer travels on a user: it is sent on the friend ledger, and only to someone who owes them. |
| onboarded | bool | Whether this person finished (or skipped) the first-run flow. Only ever meaningful about the caller themselves; always `false` on any other user, and clients must not read it off anyone else. |
| deleted | bool | An anonymous member whose original account was erased. Historical money stays visible; clients exclude this member from new expense selections. |
| avatar_url | string | Google profile picture URL; empty for everyone who signed in without Google, and never guaranteed even for Google users. Clients must keep the initials-on-`avatar_color` rendering as the fallback. |
| phone_verified | bool | **Private**, like `phone` itself. Whether the number has passed SMS possession verification (§35). Stored (`users.phone_verified_at`), not inferred, because numbers written before verification existed carry no stamp. False with a phone set means the clients prompt to verify; until then anyone proving possession can move the number to their own account (§34). Always `false` in public projections. |

### Projections

The server maps `users` rows through exactly three shapes — see
[conventions.md § Privacy Projections](conventions.md#privacy-projections):
the caller's own profile (`toPrivateUser`: everything), other people
(`toPublicUser`: contact and onboarding cleared), and pending friend-request
senders (`toFriendRequestUser`: identity fields only — no currency or
registration status until the request is accepted). None of them carries how
the person is paid.

## PaymentHandle

**Retired with `User.payment_handles`.** The message stays declared so the
field does; nothing writes or returns one. It was one "pay me here"
identifier: a Venmo username, a Zelle email or phone, a `$cashtag`, a
PayPal.Me name. Existing handles were copied into payment methods.

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
| amount_cents | int64 | Always > 0 when emitted. |

## NetBalance

A user's net position within some scope.

| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The user. |
| net_cents | int64 | Positive = they are owed; negative = they owe. |

## CurrencyAmount

One amount in one currency. **Balances are kept per currency and never added
across currencies** — a dollar and a euro are not the same cent, and nothing
in the system converts. Lists of these are ordered with the caller's default
currency first, then alphabetically.

| Field | Type | Description |
| --- | --- | --- |
| currency | string | ISO 4217 code. |
| cents | int64 | Signed; zero buckets are omitted rather than sent. |

## CounterpartyBalance

The caller's overall position against one person, across groups and one-off
expenses.

| Field | Type | Description |
| --- | --- | --- |
| user | User | The counterparty (public projection). |
| net_cents | int64 | **Legacy:** the position in the caller's default currency only; > 0 = they owe you. Kept for older clients. |
| balances | repeated CurrencyAmount | The whole picture: one entry per currency with anything outstanding; cents > 0 = they owe you that much of that currency. |

> **Gotcha:** `net_cents` is not "the total" — it is one currency's bucket.
> A counterparty can owe €50 while `net_cents` reads 0 because the caller's
> default currency is USD. New UI must read `balances`.
