# HaalKhata — Code Audit: The Good, the Bad, and the Ugly

A full pass over the repo (architecture, security, data model, ops, frontend).
Findings are sorted by severity within each section. File:line references use
`apps/web/...` unless noted.

---

## The Good

### Architecture & layering
- **Clean schema-first contract.** Protobuf in `/proto` is the single source
  of truth; `buf` generates TypeScript used by *both* server handlers and the
  browser client. A future mobile app can regenerate from the same protos.
  `buf.yaml` runs `STANDARD` lint + `FILE` breaking checks. This is genuinely
  well thought out.
- **Strict, enforced layering.** `eslint.config.mjs:17` forbids the UI from
  importing `@/server/*/repo/*` or `@/server/common/db`; handlers have no SQL
  and no business logic; usecases have no SQL and no transport types; repos
  have SQL only. The `id-length >= 4` rule and JSDoc-everywhere convention
  show real discipline.
- **Domain math is pure and well tested.** `src/server/expense/domain/`
  (`money.ts`, `splits.ts`, `balances.ts`) are pure functions with 21 vitest
  cases including a 200-run randomized "receipts always reconcile" property
  test. Largest-remainder allocation guarantees splits sum to the exact cent.
- **Integer cents everywhere.** No floats for money. `int32` cents in proto,
  `INTEGER` columns in Postgres, `allocate()` in `money.ts`. This avoids an
  entire class of rounding bugs.
- **Server-recomputed splits.** `expense.usecase.ts:58` (`buildExpenseWrite`)
  never trusts client-supplied split amounts — it recomputes them from the
  raw spec. Only the total and the per-type inputs are accepted.
- **Transactions where they matter.** `insertExpense` / `replaceExpense` /
  `insertGroup` / `insertNotifications` all run inside `transaction()` with
  proper ROLLBACK on throw (`db.ts:102`).
- **Parameterized SQL everywhere.** Every query uses `$1` placeholders. No
  string-concatenated SQL, no injection vectors in the repo layer.
- **Soft-delete on expenses** preserves audit history; balances filter
  `deleted_at IS NULL`.
- **Quality gates pass clean.** `pnpm typecheck`, `pnpm lint`, `pnpm test`
  (21/21) all green. Verified.

### Auth
- **scrypt password hashing** with a random 16-byte salt and
  `timingSafeEqual` verification (`auth.usecase.ts:43,56`). Scrypt is the
  right modern choice (argon2id would be marginally better; bcrypt is fine
  too — scrypt is good).
- **HMAC-SHA256 signed bearer tokens** with `timingSafeEqual` signature
  comparison and expiry check (`auth.usecase.ts:110`).
- **httpOnly + SameSite=Lax session cookie** (`context.ts:52`). Not
  accessible to JS.
- **Generic login error** (`auth.usecase.ts:173` "invalid email or password")
  avoids user enumeration on login. Shadow users (password_hash NULL) are
  rejected with the same message.

### Ops
- **Multi-stage Dockerfile, non-root `USER node`, standalone output.**
  Slim runtime image with no toolchain.
- **Auto-migrate on boot** (`db.ts:38`) — zero-step dev and Docker.
- **`.dockerignore`** excludes `.env*`, `node_modules`, `.git`, `data`.
- **DB port bound to 127.0.0.1** in compose (`docker-compose.yml:15`) —
  loopback only, not exposed to the network.
- **Provider abstraction for receipt AI** (`receipt.usecase.ts`) with a
  config-driven failover chain and a deterministic mock fallback so the demo
  always works.

---

## The Bad

### Security — Session & Auth
- **B1.~~Session cookie not `Secure`.~~** ✅ *Fixed.* Cookie attributes
  now go through `sessionCookieAttributes()` (`connect.constants.ts`) which
  appends `Secure` only when `NODE_ENV === "production"`, so plain-HTTP dev
  on localhost still works while prod (behind TLS) gets the flag.
- **B2.~~No CSRF protection for the cookie path.~~** ✅ *Fixed.* Added
  `csrfGuard` (`server/api/connect/csrf.ts`) wrapped around the Connect
  mount point. It rejects cookie-bearing state-changing requests whose
  `Origin`/`Referer` doesn't match the request host; Bearer-token clients
  (mobile) are exempt.
- **B3.~~No rate limiting / brute-force protection.~~** ✅ *Fixed.* Added
  `server/common/rateLimit.ts` (in-memory sliding 60s window) and
  `enforceAuthRateLimit` in `auth/handler.ts` that caps login/signup at
  `AUTH_RATE_LIMIT` (10) attempts/min per client IP, throwing
  `Code.ResourceExhausted`. Note: in-process only — multi-replica deploys
  would need a shared store.
- **B4.~~Tokens are stateless and non-revocable.~~** ✅ *Fixed.* Added a
  `token_version` column to `users` (migration `1783900800000`); tokens now
  embed the version at issue time (`userId.version.expiry.signature`).
  `requireUser` reads the current row version and rejects mismatched tokens.
  `logOut` bumps the version, revoking all outstanding tokens. (Password
  change could bump too — see B6 follow-up.)
- **B21.~~No migration for `token_version`…~~** ✅ *Merged into B4.*
- **B5.~~`SESSION_SECRET` defaults to empty in `.env.example`.~~** ✅
  *Fixed.* `secret()` in `auth.usecase.ts` now throws when
  `NODE_ENV === "production"` and `SESSION_SECRET` is unset, instead of
  silently writing a dev secret file. The dev fallback (persisted
  `data/.secret`) is unchanged.
- **B6.~~No password complexity beyond length ≥ 6~~** ✅ *Fixed.* Added
  `PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH` (1024) constants and a
  `validatePassword` helper used at signup. Login also rejects oversized
  passwords before running scrypt (CPU-DoS guard).

### Security — Authorization (IDOR / privilege)
- **B7.~~Any group member can remove any other member.~~** ✅ *Fixed.*
  `removeMemberFromGroup` now calls `assertGroupOwner`, which checks the
  caller's `role` is `"owner"` via the new `memberRole` repo helper.
  Owners also can't remove themselves (prevents orphaned groups).
- **B8.~~Any participant can edit/delete any expense.~~** ✅ *Fixed.* Added
  `assertCanModify` (separate from the read-only `assertCanTouch`) that
  requires `expense.created_by === userId`; `updateExpense` and
  `deleteExpense` now use it. Viewing (`getExpense`) still allows any
  participant. For group expenses the creator must also still be a member.
- **B9.~~Settlement records have no balance guard.~~** ✅ *Fixed.* Added
  `amountOwed(debtor, creditor, groupId)` to `balance.usecase` (works in
  group or global scope). `recordSettlement` now rejects a settlement when
  the caller owes the recipient nothing, or for more than they owe —
  preventing the balance-flip attack.
- **B10.~~`addMemberByEmail` lets any member invite anyone.~~** ✅ *Fixed.*
  `addMemberByEmail` now also goes through `assertGroupOwner`, so only the
  group owner can invite new members.

### Security — Input validation
- **B11.~~`expense_date` is accepted as any string.~~** ✅ *Fixed.* Added
  `normalizeExpenseDate` in `expense.usecase` that validates the
  `YYYY-MM-DD` shape (`ISO_DATE_PATTERN`) and that the date is real,
  rejecting garbage like `"not-a-date"`. Empty falls back to today.
- **B12.~~No upper bound on array sizes.~~** ✅ *Fixed.* `buildExpenseWrite`
  now rejects requests with more than `MAX_EXPENSE_PARTICIPANTS` (100) payers,
  split specs, or items, and a description > 200 chars. Bounds the per-request
  SQL fan-out in `insertChildren`. (See U10 for the bulk-insert follow-up.)
- **B13.~~`category` and `method` are free-text.~~** ✅ *Fixed.* Added
  `EXPENSE_CATEGORIES` and `SETTLEMENT_METHODS` allowlists in
  `expense.constants.ts`; `buildExpenseWrite` and `recordSettlement` now
  coerce unknown values to `"general"` / `"cash"` instead of storing
  arbitrary strings.
- **B14.~~Comment body has no max length.~~** ✅ *Fixed.* `addComment` now
  rejects trimmed bodies longer than `MAX_COMMENT_LENGTH` (2000 chars).

### Data model
- **B15.~~Missing indexes.~~** ✅ *Fixed.* Migration `1783987200000` adds:
  `expense_payers(user_id)`, `settlements(from_user|to_user|group_id)`,
  `group_members(user_id)`, `activity(group_id)`, a GIN index on
  `activity(audience)` (fixes the `@> to_jsonb` containment full-scan),
  and `comments(expense_id)`.
- **B16.~~No `CHECK` constraints.~~** ✅ *Fixed.* Migration `1783987200000`
  adds `CHECK (>= 0)` on `expenses.amount_cents/tax_cents/tip_cents`,
  `expense_payers.amount_cents`, `expense_splits.owed_cents`,
  `expense_items.total_cents`, `expense_items.quantity > 0`,
  `expense_item_assignments.weight > 0`, and `settlements.amount_cents > 0`.
  Validation still lives in the usecase, but the DB now backstops it.
- **B17.~~`expense_item_assignments.weight` is `INTEGER`.~~** ✅
  *Documented.* The proto field is `int32` and the column is `INTEGER`, so
  the integer type is faithful to the contract. Added a doc comment to
  `ItemInput.assignments.weight` clarifying weights are integer ratios
  (2:1, not 0.5:0.25); `allocate()` handles them as float ratios internally.
- **B18.~~`activity.group_id` has no FK.~~** ✅ *Fixed.* Added the FK
  with `ON DELETE SET NULL` so deleting a group leaves the feed row intact
  but no dangling reference remains.
- **B19.~~`friendships` has no `CHECK (user_id <> friend_id)`.~~** ✅
  *Fixed.* Migration `1783987200000` adds the constraint; the usecase guard
  is now backed by the DB.
- **B20.~~`expense_payers` sum not validated at DB level.~~** ✅
  *Mitigated.* A DB-level aggregate constraint would require a trigger;
  instead the usecase checks `paidCents === amountCents` before insert and
  `insertChildren` runs inside a single transaction, so a partial write
  rolls back. The new `CHECK (amount_cents >= 0)` (B16) backstops individual
  rows. A trigger-based sum guard is deferred as low-value.
- **B21.~~No migration for a `token_version` / `password_changed_at`~~** —
  ✅ *Done as part of B4.*

### Frontend
- **B22. Query cache never persisted.** ⏸ *Deferred.* Requires adding
  `@tanstack/query-persist-client-core` + a storage persister dependency;
  skipped to avoid an unprompted new dep. Worth revisiting for the PWA story.
- **B23.~~`useShellData` polls notifications every 30s~~** ✅ *Fixed.*
  Added `refetchIntervalInBackground: false` so polling pauses when the
  tab is hidden.
- **B24.~~`errorMessage` strips the Connect code prefix with a regex~~**
  ✅ *Fixed.* Now checks `error instanceof ConnectError` and uses the
  structured `rawMessage` property instead of regex-stripping `.message`.
- **B25.~~No `<Suspense>`/error boundary above route segments.~~** ✅
  *Fixed.* Added `(app)/error.tsx` — a route-level error boundary that
  catches unexpected throws, logs them, and renders a safe fallback with
  "Try again" + "Back to dashboard" instead of Next's default error page.

### AI / Receipt
- **B26.~~Anthropic model name is a non-existent snapshot.~~** ✅ *Fixed.*
  Model moved to `ANTHROPIC_MODEL` constant (env-configurable, defaults to
  `claude-opus-4-8`); a deprecated alias can now be swapped via env without
  a code change.
- **B27.~~`JSON.parse(text)` on provider output is unguarded.~~** ✅
  *Fixed.* Added `safeJsonParse(text, providerName)` that throws a clear
  `<provider> returned non-JSON output (length N)` error instead of the
  opaque `Unexpected token...`. Both providers use it.
- **B28.~~`localProvider` extracts JSON by indexOf/lastIndexOf.~~** ✅
  *Fixed.* Replaced with `extractJsonObject(text)` which tracks brace
  depth and string context, so nested objects and `}` inside JSON strings
  no longer break extraction.
- **B29.~~No image content sniffing.~~** ✅ *Fixed.* Added
  `IMAGE_MAGIC_BYTES` map in `receipt.constants.ts`; `parseReceipt` now
  checks the first few bytes against the declared media type and rejects
  mismatches before any provider call.

---

## The Ugly

### Operational landmines
- **U1.~~Auto-migrate on boot in production.~~** ✅ *Fixed (mitigated).*
  Migrations now run via an explicit `ensureMigrated()` invoked once at
  module load in the connect mount point, awaited before the first request
  is served — not lazily on the first query. The global cache still makes
  it once-per-process. (A true deploy-pipeline migrate step is still
  preferable for zero-downtime deploys; this is the pragmatic Next.js fix.)
- **U2.~~The `ready()` migration is awaited on every `query()` call.~~**
  ✅ *Fixed.* `query()` and `transaction()` no longer await `ready()` —
  the migration wait happens once at mount-time; the hot path is now a
  direct `pool().query()`.
- **U3.~~`globalCache` pool hack / no pool config.~~** ✅ *Fixed.* The Pool
  is now created with `max: 20`, `idleTimeoutMillis: 30s`,
  `connectionTimeoutMillis: 5s` so multi-replica deploys don't exhaust
  Postgres `max_connections` and idle connections are reaped. (The
  `globalThis` cache is retained — it's the standard Next HMR workaround.)
- **U4.~~`docker-compose.yml` exposes web on `0.0.0.0:3000` with no TLS.~~**
  ✅ *Fixed.* The web port is now bound to `127.0.0.1:3000` (loopback only)
  with a comment directing operators to put a TLS-terminating reverse proxy
  in front and expose 443 there. The Secure cookie flag (B1) now has a
  credible deployment story.
- **U5.~~`POSTGRES_PASSWORD` defaults to `haalkhata`~~** ✅ *Fixed.*
  `assertSafeDatabaseUrl()` in `db.ts` throws when `NODE_ENV === "production"`
  and the connection string is the `haalkhata:haalkhata` default, so a
  forgotten `POSTGRES_PASSWORD` fails fast instead of deploying insecure-by-default.

### Performance
- **U6.~~`listGroups` is an N+1 query storm.~~** ✅ *Fixed.* Added
  `listMembersByGroupIds` (one query for all groups' members) and
  `userNetInGroups` (batched net computation); `listGroups` now does 2
  batched calls instead of 2N per-group queries.
- **U7. `getOverallBalances` loads every expense + child rows into memory.**
  ⏸ *Deferred (correctness-critical).* The balance is derived from *all*
  expenses minus settlements; capping the query would make balances wrong.
  The proper fix is a materialized `balances` table updated by trigger or
  usecase — a larger refactor deferred for now. U6 mitigated the dashboard
  path; the overall-balance RPC is only called on the dashboard/friends
  pages, not per-request.
- **U8.~~`simplifyDebts` re-sorts the arrays on every iteration~~** ✅
  *Fixed.* Both arrays are now sorted once (descending by amount, ties by
  user id) and walked with index pointers; the exhausted side's pointer
  advances instead of re-sorting + shifting. O(n log n) instead of
  O(n² log n). All 21 balance tests still pass (net-preservation holds).
- **U9. `listExpensesInvolvingUser` uses correlated `EXISTS` subqueries
  per row** (`expenses.repo.ts:266`). With the missing
  `expense_payers(user_id)` index (B15), this is a full scan × per-row
  probe.
- **U10.~~`insertChildren` runs one INSERT per row~~** ✅ *Fixed.*
  Replaced the per-row `for` loops with a `multiRowValues` helper that
  builds `VALUES ($1,$2), ($3,$4), …` clauses. Payers, splits, items, and
  assignments are each inserted in a single statement, cutting a 30-item
  receipt from ~120 round-trips to 3.

### Structural / maintainability
- **U11. The entire `data/` directory is gitignored but `DATA_DIRECTORY`
  defaults to `process.cwd()/data`** (`auth.constants.ts:16`). In the
  Docker runtime image there's no `data/` (`.dockerignore` excludes it),
  so the dev-secret fallback writes to `/app/data/.secret` — which works
  *only* because the image runs as `node` and `/app` is writable. This is
  undocumented and fragile. In production `SESSION_SECRET` must be set,
  and the app should hard-fail instead of silently writing a secret file.
- **U12.~~`findOrCreateUserByEmail` is a TOCTOU race.~~** ✅ *Fixed.* The
  `insertUser` call is now wrapped in a try/catch that detects Postgres
  SQLSTATE `23505` (unique_violation) on `lower(email)` and re-reads the
  now-existing row, so two concurrent invites to the same email no longer
  surface a 500.
- **U13. `claimUser` doesn't verify the shadow user's email matches.**
  Anyone who can guess a shadow user's id can claim it by signing up with
  a *different* email — `signUp` (`auth.usecase.ts:142`) looks up by
  email, finds the shadow row, and calls `claimUser(existing.id, ...)`,
  overwriting the name + password but never checking that the email in the
  row matches the signup email. Actually — wait, the lookup *is* by email,
  so the emails match by construction. This one's fine. (Leaving the note
  to show it was checked.)
- **U14.~~No error boundary or structured logging.~~** ✅ *Fixed.* Added
  `server/common/logger.ts` (JSON-line `logEvent`/`logError` to stdout/stderr
  with timestamp + context). `runUsecase` now takes the handler context and
  logs unexpected (non-UsecaseError) exceptions with the RPC method name and
  a per-request id before rethrowing. All five handlers pass `context`
  through.
- **U15.~~No tests outside domain math.~~** ✅ *Partly fixed.* Added
  `auth/usecase/auth.test.ts` — 6 tests covering the token sign/verify
  round trip, version embedding, signature tamper rejection, user-id
  tamper rejection, bogus-signature rejection, and malformed-token
  rejection. Usecase/repo/handler tests are still a gap (deferred — they
  need a test DB harness).
- **U16.~~`plan.txt` is committed~~** ✅ *Fixed.* Moved to `docs/plan.txt`
  (out of the repo root); README and `.dockerignore` references updated.
- **U17. Generated protogen is committed to git** (the staged files include
  `packages/protogen/src/**/*.ts`). This bloats the repo and causes merge
  conflicts on every proto change. The Dockerfile regenerates it anyway
  (`Dockerfile:16`). Add `packages/protogen/src/` to `.gitignore`.
- **U18. `pnpm-lock.yaml` + a staged `node_modules/` untracking fix in the
  last commit** (`git log` shows "Fix .gitignore: unanchor node_modules")
  suggests `node_modules` was previously committed. Verify
  `git ls-files | grep node_modules` is empty.
- **U19. No `AGENTS.md` / `CONTRIBUTING.md`.** The README is good, but
  there's no guide for an AI agent or new contributor on *how* to add a
  domain (new proto → regen → handler → usecase → repo → route → page).
  The `plan.txt` has it but it's not discoverable.

### Frontend ugliness
- **U20. The service worker caches `/dashboard` at install time**
  (`sw.js:3` `SHELL`). If the user is logged out, the SW caches the
  login-redirect HTML for `/dashboard` and serves it forever, even after
  login. The network-first fetch handler (`sw.js:24`) mitigates online, but
  offline shows a stale redirect. Don't precache HTML routes; precache only
  static assets.
- **U21. `sw.js` has no version-bump discipline.** `CACHE = "haalkhata-v1"`
  — when you deploy a new build, you must manually bump `v1`→`v2` or users
  get stale assets. There's no build step that injects a hash. Tie the
  cache name to the Next build id.
- **U22. `AppShell` hardcodes `NAVIGATION_ITEMS.slice(0, 2)` and
  `.slice(3)`** (`AppShell.tsx:139,149`) to skip the middle "add" button.
  Brittle — reordering the constants array silently breaks the mobile nav.
- **U23. No skeleton/optimistic updates.** Every mutation invalidates
  `MONEY_KEYS` (`queryKeys.ts:52`) which is a broad prefix match —
  refetches basically everything. There's no `onMutate` optimistic update,
  so adding an expense shows a spinner then a full re-fetch.

---

## Priority fix list

1. **B1** — Add `Secure` to the session cookie (production-gated).
2. **B5 / U1 / U5** — Refuse to boot in production without `SESSION_SECRET`
   and with the default DB password; move migrations out of the request
   path.
3. **B7 / B8 / B9 / B10** — Fix the authorization model: owner-only member
   removal, creator-or-admin expense edits, settlement ≤ outstanding debt.
4. **B3** — Add login rate limiting.
5. **B4** — Add a `token_version` so password change / logout invalidates
   tokens.
6. **U6 / U7** — Batch the dashboard queries; materialize balances.
7. **B15** — Add the missing indexes (especially `expense_payers(user_id)`
   and a GIN on `activity(audience)`).
8. **B12 / U10** — Cap input array sizes; bulk-insert child rows.
9. **U12** — Handle the `findOrCreateUserByEmail` unique-constraint race.
10. **U17** — Stop committing generated protogen.

---

*Audited against commit `1069cf1` on `main`. All findings verified against
source; typecheck/lint/test pass clean as of this audit.*
