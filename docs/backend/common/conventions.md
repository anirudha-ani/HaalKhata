# Backend Conventions

Rules that apply to every RPC in every service. Service docs assume all of
this and only call out where an endpoint is special.

---

## Transport

- **Protocol:** ConnectRPC over HTTP. Every method is
  `POST /api/connect/<package>.<Service>/<Method>` (e.g.
  `POST /api/connect/expense.v1.ExpenseService/CreateExpense`). Browsers use
  JSON; the mobile app uses the same routes.
- **Mount:** `apps/web/src/pages/api/connect/[[...connect]].ts`. Before any
  handler runs the mount:
  1. Overwrites the `x-haalkhata-peer-ip` header with the socket's remote
     address (so a client can never spoof the IP used for rate limiting).
  2. Runs the CSRF guard (below); rejected requests get a plain `403` JSON body.
  3. Awaits `ensureMigrated()` — pending SQL migrations are applied once per
     process. A migration failure returns `503 {"error":"service temporarily
     unavailable"}` and is retried on the next request rather than bricking
     the process.
- **Body size:** decoded Connect requests are capped at **12 MiB**
  (`CONNECT_READ_MAX_BYTES`) — sized for the 8 MB receipt-image cap plus
  base64/JSON overhead — and rejected before authentication or handlers run.
- **Readiness:** `GET|HEAD /api/health` verifies the signing secret, the
  migration runner, and a live `SELECT 1` before reporting `200 {"status":"ok"}`;
  any failure is one generic `503` (no failure detail leaks).

## Authentication & Sessions

Two credential transports, one token format:

| Client | Carries the session as | Receives new tokens via |
| --- | --- | --- |
| Browser | HttpOnly session cookie (`__Host-hk_token` in production, `hk_token` in dev) | `Set-Cookie` response header |
| Mobile app | `Authorization: Bearer <token>` (announces itself with the shared session-transport header, value `bearer`) | `token` field of auth responses; renewals in the shared session-renewal response header |

**Token format:** `v2.<userId>.<tokenVersion>.<expiryUnixSeconds>.<signature>`
— an HMAC-SHA256 over a purpose-bound payload (`"session\0" + payload`), so a
session token can never validate as a phone-merge token or vice versa even
though they share the root secret.

- **Lifetime:** 7 days absolute (`TOKEN_LIFETIME_SECONDS`).
- **Sliding renewal:** any authenticated RPC on a token past half its lifetime
  re-issues it — as a fresh cookie for cookie callers, or in the session-renewal
  response header for bearer callers. Someone who opens the app at least weekly
  is never signed out; an abandoned token still dies on schedule. `LogOut` is
  exempt (renewal would race the cookie clear).
- **Revocation:** the token embeds the user's `token_version`; `requireUser`
  compares it against the row on every request. `LogOut` bumps the version,
  revoking every outstanding token at once.
- **Key material:** `SESSION_SECRET` (hex or Base64 decoded, ≥32 bytes enforced
  in production; dev generates and persists one under `data/.secret`).
  `SESSION_SECRET_PREVIOUS` may hold the prior key during a planned rotation —
  verification checks both keys (all of them, in constant time, so timing does
  not reveal which matched); issuance uses only the current one. Incident
  rotation leaves it unset, invalidating every session at once.
- **Bearer secrecy rule:** a browser never receives bearer material. Auth
  responses return `token: ""` to cookie clients — an HttpOnly cookie exists
  precisely so script cannot read the session, and echoing the token in JSON
  would undo that for any script running during sign-in.

`requireUser(context)` is the single entry point: parses bearer-then-cookie,
verifies signature/expiry/format, checks `token_version` against the row,
performs the sliding renewal, and returns the user id — or throws
`Unauthenticated`.

## CSRF

`csrfGuard` (in the mount, before routing): a state-changing request that is
**cookie-authenticated** and carries no canonical `Authorization: Bearer`
header must present an `Origin` (or `Referer`) whose host matches the request's
own `Host`; otherwise `403`. Bearer clients are exempt (browsers don't attach
bearer headers cross-site). Details that matter:

- The guard and `requireUser` share one bearer parser
  (`bearerTokenFromAuthorization`, exactly `Bearer<space><no-whitespace>`), so
  a malformed header that authentication would ignore can never earn a CSRF
  exemption.
- Duplicate session-cookie names are rejected outright
  (`sessionTokenFromCookieHeader` returns null) instead of trusting
  browser/proxy ordering — cookie tossing cannot select an attacker value.

## Error Model

Usecases throw `UsecaseError` (via `invalid` / `notFound` / `denied` / `unavailable` helpers);
`runUsecase` maps codes onto Connect status codes:

| `UsecaseErrorCode` | Connect code | Typical meaning |
| --- | --- | --- |
| `invalid_argument` | `InvalidArgument` | Bad input; message is user-facing |
| `unauthenticated` | `Unauthenticated` | No/expired session, failed sign-in |
| `permission_denied` | `PermissionDenied` | Authenticated but not allowed |
| `not_found` | `NotFound` | Entity missing (also used to avoid existence oracles) |
| `already_exists` | `AlreadyExists` | Registered account already holds an identifier |
| `failed_precondition` | `FailedPrecondition` | e.g. an aggregate exceeds the int32 wire field |
| `unavailable` | `Unavailable` | A dependency (SMS provider, receipt vision provider, in-flight duplicate) is temporarily unusable |

Anything else (a pg error, a bug) is logged server-side with a random request
id and the RPC name; the client receives only
`internal server error (request <uuid>)` with code `Internal`. Database and
provider messages never reach a client. Rate-limit rejections use
`ResourceExhausted` and are thrown by handlers directly.

`UsecaseError` messages are written to be shown to the user verbatim — that is
the contract: if a message is not safe to show, it must not be a
`UsecaseError`.

## Rate Limiting

An in-memory sliding-window limiter (`rateLimitCheck(key, max, windowMs)`),
1-minute window by default. **Per process** — a multi-replica deploy needs a
shared store; today's deployment is single-instance. The exception is the
SMS anti-abuse ceilings, which live in Postgres (`phone_send_events`) and
therefore survive restarts and span replicas — a harassment ceiling that
forgets on deploy is not a ceiling. Hard-capped at 10,000
tracked keys with LRU eviction so it cannot be a memory-exhaustion vector.

| Bucket | Key | Limit |
| --- | --- | --- |
| Sign-in/up, Google begin+finish | `auth:<client-ip>` | 10/min |
| SetPhone (SMS send) | `phone:send:<userId>` | 3/min |
| SetPhone (code check) | `phone:check:<userId>` | 5/min |
| ConfirmPhoneMerge, RemovePhone | `phone:merge:<userId>` | 5/min |
| SMS sends per destination number | keyed HMAC, **durable** (`phone_send_events`) | 3/hour, 8/day |
| SMS sends per client IP | **durable** (`phone_send_events`) | 20/hour |
| `AddFriend` | per account | 10/min |
| `AcceptInviteLink` | per account | 10/min |
| `PreviewInviteLink` | per client IP (unauthenticated) | 30/min |
| `AddMembers` | per account | 15/min |
| `CreateExpense` | per account | 30/min |
| `SendReminder` | per account | 10/min |
| `ParseReceipt` | per account | 5/min (+ max 2 concurrent per process) |
| Ledger reads (`ListExpenses`, `ListGroups`, `GetFriendLedger`, `GetGroupBalances`, `GetOverallBalances`/`ListFriends`) | per account | 60/min each |

The ledger reads are limited because each one rebuilds balances from every row
in scope; a person tapping through screens uses a handful a minute, a script
can turn one account into a load test. `ListFriends` deliberately shares the
`GetOverallBalances` bucket — it computes the same full-ledger aggregate, so
neither endpoint can be used to bypass the other's limit. SMS destination
numbers are keyed by a purpose-bound HMAC, not the raw number, so a phone
number never sits in process state that doesn't need it.

Client IP comes from `clientIp()`: proxy headers (`X-Forwarded-For`,
`X-Real-IP`) are trusted **only** when `TRUST_PROXY_HEADERS=true` (a deployment
assertion that the front proxy overwrites them); otherwise the mount-injected
socket address is used, and anything non-IP resolves to `"unknown"`.

## Idempotent Operations (`operation_id`)

Every externally initiated **financial mutation** (`CreateExpense`,
`RecordSettlement`) requires a client-generated `operation_id` — a UUID naming
*one attempt*, resent unchanged on every retry and replaced only after a
success. Semantics follow the IETF Idempotency-Key draft and Stripe's
practice:

| Situation | Outcome |
| --- | --- |
| First arrival | Claim inserted in the business transaction; operation runs |
| Retry after success, same payload | The first result is **replayed** (same expense/settlement returned; nothing new stored) |
| Same id, **different payload** | `InvalidArgument`: "operation_id was already used for a different request" |
| Retry while the first is still in flight | Blocks on the first claim's insert; then replays it, or gets `Unavailable` "still being processed — try again" |
| Reused after 24 h (`OPERATION_RETENTION_HOURS`) | The claim has been pruned; the id runs again as new |

Mechanics: the `operations` table is keyed `(user_id, rpc, operation_id)` with
a SHA-256 **fingerprint** of the canonical-JSON payload (object keys sorted at
every level; the `operation_id` itself excluded). The claim, the business row,
and the completion (`result_id`) all commit in **one transaction**, so a claim
can never outlive a rolled-back mutation. Ids are 1–64 chars of
`[A-Za-z0-9_-]`. An empty id skips deduplication — allowed only for internal
callers; the transport boundary (`assertOperationId`) rejects it on external
requests. Updates and deletes carry no `operation_id`: they name the row they
change and are idempotent by nature.

## Advisory Ledger Locks

Balances are derived, so every mutation is a *read-then-write* over history —
and two of those interleaving is how money gets double-counted. Serialization
uses transaction-scoped Postgres advisory locks
(`pg_advisory_xact_lock(hashtextextended(key, 0))`), released automatically at
commit/rollback. Five lock classes (`common/ledgerLocks.ts`):

| Class | Key | Serializes |
| --- | --- | --- |
| Group ledger | `ledger:group:<groupId>` | All money + membership changes in one group |
| Participant ledger | `ledger:participant:<userId>` | One person's one-off ledgers |
| Expense | `ledger:expense:<expenseId>` | Competing update/delete of one expense row |
| Reminder | `reminder:<senderId>:<debtorId>` | The reminder cooldown check + insert |
| Friend-request inbox | `friend-request-inbox:<userId>` | Pending-request + friendship changes for one recipient |

Deadlock avoidance rests on two rules:

1. **Within a class, keys are acquired sorted** (`acquireKeys` dedups and
   sorts lexically) — two transactions locking the same set always take it in
   the same order.
2. **Across classes, one global order:** expense lock → participant locks →
   group locks → friend-request-inbox locks. Every path takes them in that
   order; the constants file is the single spelling of each prefix, because
   two modules locking "the same" inbox under different keys would exclude
   nothing.

One-off mutations lock **per participant, not per pair**: a pair set is
quadratic in the cast (a 100-participant expense would need 4,950 locks —
more than Postgres's shared lock table holds), while per-participant locks
are a superset of the pair exclusion and grow linearly.

`withLedgerTransaction` is an alias of `transaction`; it exists as the named
seam tests mock to intercept ledger transactions.

## Money Rules

- **Integer cents only.** No floats anywhere; splits reconcile to the exact
  total by construction (the shared cent-exact calculators in
  `packages/shared/expense/splits`).
- **Per-currency, never converted.** A balance between two people is one
  number *per currency*; nothing in the system converts, sums across
  currencies, or invents an exchange rate. Zero buckets are expressed by
  absence.
- **Bounds.** A single stored amount is capped at 2,000,000,000 cents
  (`MAX_MONEY_CENTS`, below int32). Aggregates (sums of rows) can exceed
  int32, so every aggregate crossing the wire goes through `toInt32Cents`,
  which turns an unrepresentable sum into a named `FailedPrecondition` instead
  of an opaque encoder crash.
- **Currency codes** are validated against the product's currency catalog
  (§36): the full ISO 4217 list minus non-transactional codes (metals, fund
  and bond units, the test/none codes), the same catalog both clients'
  pickers render with each currency's symbol. Not merely "three letters" —
  a fictional code would create a balance nobody could ever settle. Amounts
  are integers in the currency's OWN minor unit: 2 digits for most, 0 for
  JPY, 3 for KWD; formatting and input parsing follow the catalog's digits.
- **Calendar dates vs moments.** `expense_date` is a `YYYY-MM-DD` calendar
  day (validated as a *real* day — `2026-02-31` is rejected, not normalized);
  timestamps are ISO-8601 UTC and localized by clients.

## Database Boundary

- `pg` pool (max 20 connections), lazily created, survives Next.js hot
  reloads via a global cache. Migrations (`node-pg-migrate`, plain SQL under
  `migrations/`) run once per process on first request. Never edit an applied
  migration.
- **Connection safety:** production refuses missing/placeholder/short
  passwords, and any non-local host requires `sslmode=verify-full`
  (`host=` query-parameter override tricks are accounted for).
- **Timestamp spelling:** `timestamptz` values are normalized to ISO-8601 UTC
  (`…T…Z`) at the type-parser boundary — Postgres's native text form is not
  reliably parseable in browsers. `DATE`/date-text columns stay as the plain
  `YYYY-MM-DD` the user chose.
- **Soft deletes.** Expenses and settlements are never hard-deleted:
  `deleted_at` is set, list/detail reads still return the row (struck through
  in clients), and all balance math reads deleted-excluded queries. History
  stays legible; nothing owed ever silently vanishes.
- `isUniqueViolation(error)` is the one spelling of "SQLSTATE 23505" — the
  signal that a concurrent writer won an insert race the caller recovers from
  by re-reading (used in sign-up/sign-in/invite/phone TOCTOU paths).

## Privacy Projections

`users` rows cross the wire through exactly three mappers
(`auth/usecase/user.mapper.ts`):

| Mapper | Used for | email/phone | payment handles | onboarded |
| --- | --- | --- | --- | --- |
| `toPrivateUser` | The caller's own profile | ✔ | ✔ | ✔ |
| `toPublicUser` | Anyone else (groups, expenses, friends, activity) | cleared | ✔ (counterparties need them to settle) | always `false` |
| `toFriendRequestUser` | A pending request's sender | cleared | cleared | always `false` |

`registered` means "has a password **or** a Google account" — either
credential counts, or every Google account would read as an unclaimed invite.

**No existence oracles.** Endpoints that look up accounts by contact info
(`AddFriend`, `AddMembers`' email/phone, `GetFriendLedger` for strangers)
return the same response/denial whether or not an account exists.

## Secrets

`readSecret(name)` implements the Docker `_FILE` convention: `<NAME>_FILE`
names a file whose trimmed contents are the value and takes precedence over
`<NAME>` in the environment (a misconfigured `_FILE` fails loudly, never falls
back). Reading from a file keeps the value out of `/proc/<pid>/environ`, child
processes, and crash dumps. Used for `SESSION_SECRET`, `POSTGRES_PASSWORD`,
`TWILIO_API_KEY_SECRET`, `COMPATIBLE_AI_API_KEY`.

## Logging

`logEvent`/`logError` emit one structured JSON line per event to
stdout/stderr with a flat context bag. Provider and database diagnostics are
*operator information*: they go to the log; the user gets a stable sentence.
