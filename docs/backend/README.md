# HaalKhata Backend Service Documentation

HaalKhata's backend is a set of five ConnectRPC services served by the Next.js
web app (`apps/web`). Every service is defined by a protobuf contract under
`proto/` and implemented in `apps/web/src/server/<domain>/` following one
layering rule:

```
proto/<domain>/v1/<domain>.proto        the wire contract (generated into packages/protogen)
apps/web/src/server/<domain>/
  handler.ts                            thin Connect handlers: auth + rate limit + delegation
  <domain>.constants.ts                 domain constants (limits, vocabularies, env config)
  usecase/*.ts                          business logic; throws UsecaseError, never transport errors
  repo/*.ts                             all SQL for the domain; optional `client?: PoolClient` param
  domain/*.ts                           pure functions (no I/O) where the math deserves isolation
```

- **Handlers** authenticate (`requireUser` / `requireRateLimitedUser`), wrap the
  call in `runUsecase` (which maps `UsecaseError` → `ConnectError`), and manage
  transport side effects (session cookies). Nothing else.
- **Usecases** own validation, authorization, transactions, locking, and the
  activity/notification fan-out. They throw `UsecaseError` via the `invalid` /
  `notFound` / `denied` / `unavailable` helpers.
- **Repos** own every SQL statement. They accept an optional transaction client
  so usecases can compose them under one transaction and one set of locks.

All RPCs are `POST /api/connect/<package>.<Service>/<Method>` (ConnectRPC over
HTTP; JSON or binary protobuf). The mount lives at
`apps/web/src/pages/api/connect/[[...connect]].ts`.

---

## Service Index

| Service | Proto | Doc | What it owns |
| --- | --- | --- | --- |
| `auth.v1.AuthService` | [auth.proto](../../proto/auth/v1/auth.proto) | [auth/auth-service.md](auth/auth-service.md) | Sign-in (Google + dev passwords), sessions, profile, phone verification, account merge, onboarding |
| `group.v1.GroupService` | [group.proto](../../proto/group/v1/group.proto) | [group/group-service.md](group/group-service.md) | Groups, membership, ownership, the simplify-debts mode |
| `expense.v1.ExpenseService` | [expense.proto](../../proto/expense/v1/expense.proto) | [expense/expense-service.md](expense/expense-service.md) | Expenses, splits, comments, settlements, every balance and ledger read |
| `social.v1.SocialService` | [social.proto](../../proto/social/v1/social.proto) | [social/social-service.md](social/social-service.md) | Friend requests (incoming, sent, cancel), friends list, activity feed, notifications, reminders |
| `receipt.v1.ReceiptService` | [receipt.proto](../../proto/receipt/v1/receipt.proto) | [receipt/receipt-service.md](receipt/receipt-service.md) | AI receipt itemization (image → draft expense) |

## Cross-Cutting Documentation

| Doc | Covers |
| --- | --- |
| [common/conventions.md](common/conventions.md) | Transport, authentication & session renewal, CSRF, error model, rate limiting, idempotent operations, advisory ledger locks, money rules, database boundary, privacy projections, secrets |
| [common/common-types.md](common/common-types.md) | The shared `common.v1` messages (`User`, `PaymentHandle`, `Debt`, `NetBalance`, `CurrencyAmount`, `CounterpartyBalance`) and their privacy semantics |

## The Two Sentences That Explain Most Design Decisions

1. **Every cent of debt lives in exactly one scope** — a group, or a pair's
   one-off ledger — and each scope's balance is derived from only its own
   expense and settlement rows. Nothing is ever stored as "a balance";
   balances are recomputed from history on every read. This is why
   settlements are *allocated* to scopes at write time, why deletes are soft,
   and why the settlement guards, the dashboard, and the friend ledger must
   all read the same routed debt graph.

2. **The server never trusts a client to do money math or to identify
   itself.** Splits are recomputed server-side from the raw specification;
   Google sign-in reads identity from the verified token claims, never from
   request fields; and every externally initiated financial mutation must
   carry a client-generated `operation_id` so a retried request cannot create
   a second row.

## Reading Order for New Engineers

1. [common/conventions.md](common/conventions.md) — the rules every RPC obeys.
2. [expense/expense-service.md](expense/expense-service.md) — the scope/ledger
   model; the heart of the product.
3. The remaining service docs in any order.

---

*These documents describe the implementation as of 2026-08-31. When behavior
and documentation disagree, the code is right and the doc has rotted — fix the
doc in the same PR that changes the behavior.*
