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
session token can never validate as any other value signed with the same
root secret (rate-limit keys, log fingerprints) or vice versa.

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

**The admin surface is the one exception to all of the above.** The admin
page on the admin hostname (usage overview and report queue) has its own
sign-in, its own cookie and its own server-side session table; it never
calls `requireUser`, and an app session of either kind opens nothing there.
See [adminanalytics-service.md](../adminanalytics/adminanalytics-service.md)
and [adminmoderation-service.md](../adminmoderation/adminmoderation-service.md).

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
- The admin services do not rely on this guard alone. Their handlers require
  `Origin` to equal `Host` on every call, with no bearer exemption, because
  the app's hostname is the same *site* as the admin hostname and
  `SameSite` does not keep the two apart.

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
| `failed_precondition` | `FailedPrecondition` | e.g. an expense would take someone past what their expenses may add up to |
| `unavailable` | `Unavailable` | A dependency (SMS provider, receipt vision provider, in-flight duplicate) is temporarily unusable |

Anything else (a pg error, a bug) is logged server-side with a random request
id and the RPC name; the client receives only
`internal server error (request <uuid>)` with code `Internal`. Database and
provider messages never reach a client. Rate-limit rejections use
`ResourceExhausted` and are thrown by handlers directly.

That covers only what runs **inside** `runUsecase`, so a handler does all its
work there, the session check (`requireUser` / `requireRateLimitedUser`)
included: it reads the database. Connect still hides an error thrown outside
it (the client sees a bare `internal error`), but nothing is logged and there
is no request id to look up. `api/connect/sessionCheckFailure.test.ts` calls
the RPCs over HTTP with that read failing and checks for both.

`UsecaseError` messages are written to be shown to the user verbatim — that is
the contract: if a message is not safe to show, it must not be a
`UsecaseError`.

## Before the Handler

Connect reads, decompresses and decodes a request body before any of the
app's code runs, so everything that bounds what an anonymous request can
cost has to sit in front of that:

- **Request caps** (`readMaxBytes`, checked after decompression): 64 KiB by
  default; 512 KiB for social (a 1,000-contact lookup is about 257 KB),
  1 MiB for expenses (100 items × 100 assignments is about 0.5 MB), 12 MiB
  for receipts (an 8 MiB photo plus encoding overhead). The numbers and
  their arithmetic are in `api/connect/connect.constants.ts`;
  `mount/requestCaps.test.ts` builds each service's largest legitimate
  request and checks it fits.
- **Unknown fields are dropped** while decoding
  (`binaryOptions.readUnknownFields: false`). The app never reads them, and
  kept, a few megabytes of them cost about a gigabyte of objects.
- **Request gates** run once the headers are in, before the body is read.
  The default asks for a validly signed, unexpired session token (no
  database read; `requireUser` still checks revocation in the handler).
  Auth and social let their anonymous calls through and pace them per
  address there; the admin services check host and origin.
  `mount/requestLimits.test.ts` drives all of this over HTTP, including a
  12 MiB body brotli-compressed to a few bytes.
- **Body deadlines**: a body has 15 s to arrive in full (60 s for a receipt
  photo) before the connection is dropped (`mount/bodyDeadline.ts`); Caddy
  gives a whole request 60 s at the edge.
- **Memory ceiling**: in production the web container is capped at 640 MB
  with Node's heap at 384 MB, so a runaway allocation restarts web instead of
  starving Postgres on the same droplet.

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
| Sign-in/up, Google begin+finish (checked in the auth request gate, before the body is read) | `auth:<client-ip>` | 10/min |
| SetPhone (SMS send) | `phone:send:<userId>` | 3/min |
| SetPhone (code check) | `phone:check:<userId>` | 5/min |
| RemovePhone | `phone:remove:<userId>` | 5/min |
| SMS sends per destination number | keyed HMAC, **durable** (`phone_send_events`) | 3/hour, 8/day |
| SMS sends per client IP | **durable** (`phone_send_events`) | 20/hour |
| `AddFriend` | per account | 10/min |
| `AcceptInviteLink` | per account | 10/min |
| `PreviewInviteLink` | per client IP (unauthenticated) | 30/min |
| `AddMembers` | per account | 15/min |
| `CreateExpense` | per account | 30/min |
| `SendReminder` | per account | 10/min |
| `FindContacts` | per account | 5/min, plus 5,000 identifiers per UTC day, **durable** (`contact_lookup_usage`) |
| `SendFriendRequests` | per account | 3/min |
| Payment method writes (create, update, delete, set-preferred) | per account, one shared bucket | 30/min |
| `ParseReceipt` | per account | 5/min (+ max 2 concurrent per process) |
| Ledger reads (`ListExpenses`, `ListGroups`, `GetFriendLedger`, `GetGroupBalances`, `GetOverallBalances`/`ListFriends`) | per account | 60/min each |
| Older statement pages (`ListFriendLedgerEntries`) | per account | 120/min: each fingerprints the pair's history; someone scrolling a long statement reads several |
| `GetInsights` | per account | 30/min |
| Admin sign-in nonce (`BeginSignIn`) | `admin-nonce:<client-ip>` | 30/min: each page load and each refused sign-in asks for a fresh one |
| Admin sign-in (`SignIn`) | `admin-auth:<client-ip>` | 5/min |
| `GetUsageOverview` | one bucket for every admin session | 30/min |
| `GetUsageTrend` | one bucket for every admin session | 60/min |
| `ListReports` | one bucket for every admin session | 30/min |
| Moderation actions (dismiss, remove, suspend, resume) | one shared bucket for every admin session | 30/min |

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
commit/rollback. Six lock classes (`common/ledger/ledgerLocks.ts`):

| Class | Key | Serializes |
| --- | --- | --- |
| Group ledger | `ledger:group:<groupId>` | All money + membership changes in one group |
| Participant ledger | `ledger:participant:<userId>` | One person's one-off ledgers |
| Expense | `ledger:expense:<expenseId>` | Competing update/delete of one expense row |
| Reminder | `reminder:<senderId>:<debtorId>` | The reminder cooldown check + insert |
| Friend-request inbox | `friend-request-inbox:<userId>` | Pending-request + friendship changes for one recipient |
| Payment methods | `payment-methods:<userId>` | One person's payment-method writes: the cap of 12 and the one star per currency |

Deadlock avoidance rests on two rules:

1. **Within a class, keys are acquired sorted, all at once.** `acquireKeys`
   dedups the keys and takes them in one statement, `ORDER BY lock_key
   COLLATE "C"` (Postgres calls the lock function after the sort, row by
   row), so two transactions locking overlapping sets take the shared keys in
   the same order, and a hundred locks cost one round trip.
   `ledgerLocks.integration.test.ts` checks the order on a real server. Take
   everything a request needs from one class in **one call**: two calls — say
   one per person in a loop — are two sorted sets, and two requests walking
   the same people in different orders can each hold a lock the other wants
   — the deadlock group enrolment used to have.
2. **Across classes, one global order:** expense lock → participant locks →
   group locks → friend-request-inbox locks. Every path takes them in that
   order; the constants file is the single spelling of each prefix, because
   two modules locking "the same" inbox under different keys would exclude
   nothing. The payment-methods lock is always taken alone, so it has no
   place in the order.

**Lock only what the change can touch.** A payment between two people locks
the active groups they share, never every group either is in (one account
could make that thousands). Nobody can be in more than 200 groups, deleted
ones aside, so one payment locks at most that many.

**Time limits.** `withLedgerTransaction` sets `lock_timeout` (5 s) and
`statement_timeout` (15 s) with `SET LOCAL`, so they end with the
transaction. Ledger locks are held for milliseconds; a wait that long means
something is stuck, and giving up frees one of the pool's connections. Either
limit rolls the transaction back and answers `Unavailable`: "nothing was
saved, try again in a moment".

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
- **64-bit on the wire and in the database, plain numbers in the code.**
  Money fields are `int64` in proto and `BIGINT` in Postgres. protobuf-es
  represents int64 as `bigint`, so the conversion happens once, at the
  boundary: every service is registered through `plainService`
  (`api/connect/wire/`) and every client is made by `plainClient`
  (`@haalkhata/shared/api`), both walking the message schema with
  `wireNumbers`. Handlers, usecases, screens and the shared money helpers
  only ever see numbers; a screen naming a money-bearing message imports it
  from `@haalkhata/shared/api/plainMessages`. pg reads `BIGINT` as an exact
  number (`common/db/int8.ts`). A value past 2^53 is refused at each of
  these points, never rounded.
- **Bounds.** One stored amount is at most 10^13 minor units
  (`MAX_MONEY_CENTS`, held by the database CHECKs too). Everything one person
  is on in one currency adds up to at most 10^15 (`MAX_PERSON_VOLUME_CENTS`),
  checked when an expense is created or edited, so every figure shown for
  them stays at least nine times below 2^53: sums never need a check of their
  own.
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
(`auth/usecase/identity/user.mapper.ts`):

| Mapper | Used for | email/phone | onboarded |
| --- | --- | --- | --- |
| `toPrivateUser` | The caller's own profile | ✔ | ✔ |
| `toPublicUser` | Anyone else (groups, expenses, friends, activity) | cleared | always `false` |
| `toFriendRequestUser` | A pending request's sender | cleared | always `false` |

**How a person is paid is on none of them.** Payment methods are not part of
a user. They reach somebody else in exactly one place,
`GetFriendLedger`'s `payee_methods`, and only while that somebody owes them
(see [payment-service.md](../payment/payment-service.md)). The retired
`payment_handles` field is always empty.

`registered` means "has a password **or** a Google or Apple account" — any
credential counts. Every live account has one (`chk_users_can_sign_in`), so
it is false only on a Deleted member, the stand-in account deletion leaves.

**Existence oracles are narrow and deliberate.** `AddFriend` and
`AddMembers`' email/phone refuse an identifier that belongs to nobody with
`FailedPrecondition`, so the clients can offer an invite link instead of a
dead end, and nothing is created for that person — a known trade, behind the
per-account rate limit. Beyond that one answer, `AddFriend` says nothing
about the account it found (self, already a friend, pending and blocked all
succeed quietly), and `GetFriendLedger` for strangers returns the same
denial whether or not an account exists.

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
