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
- **B7. Any group member can remove any other member.**
  `group.usecase.ts:160` (`removeMemberFromGroup`) only checks that the
  *caller* is a member — not that they're the owner or an admin. A regular
  member can kick the group creator. The `role` column exists but is never
  consulted.
- **B8. Any participant can edit/delete any expense.**
  `expense.usecase.ts:250` (`assertCanTouch`) grants write/delete to every
  payer, ower, or group member. There's no "only the creator can edit"
  rule. A participant can silently rewrite splits or delete the expense.
- **B9. Settlement records have no balance guard.** `recordSettlement`
  (`expense.usecase.ts:483`) lets a user record an *arbitrary* payment from
  themselves to anyone else — even if no debt exists, or for more than they
  owe. This flips the balance so the "creditor" now owes the attacker.
  Splitwise requires the settlement to be ≤ the outstanding debt.
- **B10. `addMemberByEmail` lets any member invite anyone.**
  `group.usecase.ts:110` — no owner/admin check. Combine with B8/B9 and a
  malicious member can invite themselves into a group, add expenses, and
  siphon balance.

### Security — Input validation
- **B11. `expense_date` is accepted as any string.** `buildExpenseWrite`
  (`expense.usecase.ts:154`) does `request.expenseDate || today` with no
  format validation. A client can send `"2099-12-31"` or `"not-a-date"`,
  which lands in the DB as TEXT and breaks ordering / display downstream.
- **B12. No upper bound on array sizes.** A `CreateExpenseRequest` with
  10,000 payers or 10,000 items will run 10,000 sequential `INSERT`s inside
  a transaction (`expenses.repo.ts:92` `insertChildren` — one query per
  child row in a `for` loop). This is both a performance and a DoS issue.
  Use `UNNEST` bulk inserts or cap `payers.length`/`items.length`.
- **B13. `category` and `method` are free-text.** `request.category ||
  "general"` and `request.method || "cash"` are stored verbatim with no
  allowlist, despite `GROUP_TYPES` and split-type sets existing elsewhere.
  Minor, but it means the schema can't be queried consistently by category.
- **B14. Comment body has no max length.** `addComment`
  (`expense.usecase.ts:439`) only checks non-empty. A 10MB comment will be
  stored and broadcast.

### Data model
- **B15. Missing indexes.** The migration creates indexes on
  `expenses(group_id)`, `expense_splits(user_id)`, `expense_items(expense_id)`,
  and `notifications(user_id, read_at)`. Missing:
  - `expense_payers(user_id)` — `listExpensesInvolvingUser` does a
    correlated `EXISTS` on it for every expense.
  - `settlements(from_user)`, `settlements(to_user)`,
    `settlements(group_id)` — used by the balance ledger queries.
  - `group_members(user_id)` — `listGroupsByUser` joins on it.
  - `activity(group_id)` and a GIN index on `activity(audience)` — the
    `audience @> to_jsonb($1)` containment scan (`activity.repo.ts:68`)
    is a full table scan today.
  - `comments(expense_id)` — though the PK `(expense_id,user_id)` doesn't
    exist on comments; the listing query filters by `expense_id` only.
- **B16. No `CHECK` constraints.** `amount_cents`, `owed_cents`,
  `weight`, `quantity` can all be negative in the DB. Validation lives only
  in the usecase; a future bypass (or a direct SQL migration) corrupts
  balances. Add `CHECK (amount_cents >= 0)` etc.
- **B17. `expense_item_assignments.weight` is `INTEGER`.** The domain treats
  weights as ratios (`allocate` uses them as float ratios in
  `money.ts:31`), but the column is integer. Fractional weights (1.5) are
  impossible, and integer weights force `totalCents * weight / sum` float
  math that's fine but undocumented.
- **B18. `activity.group_id` has no FK.** Every other `group_id` column
  references `groups(id)`, but `activity` (`migration:112`) drops the
  constraint, presumably so group-deletion doesn't cascade. There's no
  group deletion feature, so this is just an orphaned-row risk.
- **B19. `friendships` has no `CHECK (user_id <> friend_id)`.** A user can
  befriend themselves at the SQL level (the usecase guards it, but the
  constraint doesn't).
- **B20. `expense_payers` PK is `(expense_id, user_id)`.** This means a
  user can only be one payer row per expense — fine — but `amount_cents`
  isn't validated to sum to `expenses.amount_cents` at the DB level. A
  partial write (bug in `insertChildren`) leaves the ledger unbalanced
  silently.
- **B21.~~No migration for a `token_version` / `password_changed_at`~~** —
  ✅ *Done as part of B4.*

### Frontend
- **B22. Query cache never persisted.** `Providers.tsx` uses a single
  in-memory `QueryClient` with `staleTime: 10_000`. On mobile PWA reload
  (especially after the SW serves a cached shell), the user sees a flash
  of loading spinners every time. A `persistQueryClient` with localStorage
  would help the PWA story.
- **B23. `useShellData` polls notifications every 30s** forever
  (`useShellData.ts:22`), even when the tab is hidden. TanStack Query
  pauses on blur by default in v5, but `refetchInterval` keeps firing.
  Add `refetchIntervalInBackground: false`.
- **B24. `errorMessage` strips the Connect code prefix with a regex**
  (`connect.ts:35`) — fragile. If Connect changes its bracket format, error
  messages leak `[invalid_argument]` to the user.
- **B25. No `<Suspense>`/error boundary above route segments.** Each route
  has a `loading.tsx`, but a thrown error in a server component renders
  Next's default error page with no "back to safety" link.

### AI / Receipt
- **B26. Anthropic model name is a non-existent snapshot.**
  `receipt.usecase.ts:99` uses `"claude-opus-4-8"`. The SDK's `Model` union
  lists `claude-opus-4-8` (so it typechecks), but there's no date-stamped
  alias and Anthropic deprecates snapshots aggressively. This will 404 one
  day with no warning. Pin to a dated alias or read from env.
- **B27. `JSON.parse(text)` on provider output is unguarded.**
  `receipt.usecase.ts:116,155` — if the LLM returns non-JSON (it does,
  often), `JSON.parse` throws and the provider fails over. That's the
  intended behavior, but the error message swallowed is
  `"Unexpected token..."` which is useless for debugging. Wrap with a
  clearer error.
- **B28. `localProvider` extracts JSON by `indexOf("{")`/`lastIndexOf("}")`
  (`receipt.usecase.ts:154`).** This breaks on JSON containing nested `}`
  in strings, or markdown-wrapped ```json fences with trailing text.
  Brittle.
- **B29. No image content sniffing.** `mediaType` is trusted from the
  client (`receipt.handler.ts:13`). A client can send
  `mediaType: "image/jpeg"` with a PNG body, or an SVG with embedded
  script. The providers may reject it, but the 8MB cap is the only guard.
  Validate the magic bytes.

---

## The Ugly

### Operational landmines
- **U1. Auto-migrate on boot in production.** `db.ts:38` runs
  `node-pg-migrate up` inside `ready()`, which is awaited on the *first
  query of every process*. This means:
  - A failed migration bricks the app (queries throw forever; the
    `globalCache.__haalkhataReady` is reset on error so it retries —
    hammering the DB).
  - Two replicas starting simultaneously race on `pgmigrations` (the table
    is not `FOR UPDATE` locked; node-pg-migrate uses a transaction but
    that's not a cross-process lock).
  - There's no "block startup until migrated" mode — the app serves
    requests during migration.
  Migrations belong in the deploy pipeline (a `pnpm db:migrate` step before
  `node server.js`), not lazily on the first request.
- **U2. The `ready()` migration is awaited on every `query()` call.**
  `db.ts:66` — `await ready()` runs before every single query. After the
  first success it's a resolved-promise cache hit (cheap), but it still
  adds a microtask to the hot path of *every* SQL statement. Move it to
  startup-only.
- **U3. `globalCache` pool hack.** `db.ts:21` stashes the Pool on
  `globalThis` to survive HMR. This is the standard Next.js workaround, but
  it means **the migration runner and the pool can drift in separate
  dev-server compilations** — you can end up with two Pools pointing at the
  same DB. Also, `Pool` has no `idleTimeoutMillis` / `max` config — it uses
  node-postgres defaults (10 connections). Under load with multiple
  replicas, you'll exhaust Postgres `max_connections`.
- **U4. `docker-compose.yml` exposes web on `0.0.0.0:3000` with no TLS
  terminator configured.** The README says "put Caddy/nginx in front" but
  nothing enforces it. A user who runs `docker compose up` and visits
  `http://<server-ip>:3000` is sending session cookies in plaintext (B1).
- **U5. `POSTGRES_PASSWORD` defaults to `haalkhata`** in compose
  (`docker-compose.yml:11`) and `DEFAULT_DATABASE_URL` hardcodes
  `haalkhata:haalkhata` (`db.constants.ts:3`). If someone forgets to set
  the env var, they get an insecure-by-default DB. The app should refuse
  to start in production with the default password.

### Performance
- **U6. `listGroups` is an N+1 query storm.**
  `group.usecase.ts:64` does `Promise.all(groups.map(g => listMembers +
  userNetInGroup))`. For a user with 20 groups, that's 20 × (1 members
  query + 4 balance queries: expenses, children, settlements, isMember) =
  ~100 queries per dashboard load. Needs a batched `listMembersByGroupIds`
  and a batched balance computation.
- **U7. `getOverallBalances` loads every expense + child rows for the user
  into memory** (`balance.usecase.ts:108` `listExpensesInvolvingUser` →
  `loadExpenseChildren`). For a user with years of history, this is
  unbounded. Balances should be materialized (a `balances` table updated
  by trigger or usecase) rather than recomputed from scratch each call.
- **U8. `simplifyDebts` re-sorts the creditor/debtor arrays on every
  iteration** (`balances.ts:151`). O(n² log n). Fine for small groups,
  ugly for a 50-person trip. Use a heap.
- **U9. `listExpensesInvolvingUser` uses correlated `EXISTS` subqueries
  per row** (`expenses.repo.ts:266`). With the missing
  `expense_payers(user_id)` index (B15), this is a full scan × per-row
  probe.
- **U10. `insertChildren` runs one INSERT per row** (`expenses.repo.ts:92`)
  in a `for` loop. For an itemized receipt with 30 items × 4 assignments,
  that's 120+ round-trips inside the transaction. Use multi-row `VALUES`
  or `UNNEST`.

### Structural / maintainability
- **U11. The entire `data/` directory is gitignored but `DATA_DIRECTORY`
  defaults to `process.cwd()/data`** (`auth.constants.ts:16`). In the
  Docker runtime image there's no `data/` (`.dockerignore` excludes it),
  so the dev-secret fallback writes to `/app/data/.secret` — which works
  *only* because the image runs as `node` and `/app` is writable. This is
  undocumented and fragile. In production `SESSION_SECRET` must be set,
  and the app should hard-fail instead of silently writing a secret file.
- **U12. `findOrCreateUserByEmail` is a TOCTOU race.**
  `auth.usecase.ts:220` does `findUserByEmail` then `insertUser`. Two
  concurrent invites to the same email create two rows — the unique index
  on `lower(email)` (`migration:15`) will throw a constraint violation
  that bubbles up as a 500. Catch the unique violation and re-read.
- **U13. `claimUser` doesn't verify the shadow user's email matches.**
  Anyone who can guess a shadow user's id can claim it by signing up with
  a *different* email — `signUp` (`auth.usecase.ts:142`) looks up by
  email, finds the shadow row, and calls `claimUser(existing.id, ...)`,
  overwriting the name + password but never checking that the email in the
  row matches the signup email. Actually — wait, the lookup *is* by email,
  so the emails match by construction. This one's fine. (Leaving the note
  to show it was checked.)
- **U14. No error boundary or structured logging.** `runUsecase`
  (`context.ts:76`) rethrows non-`UsecaseError` exceptions unchanged. There
  is no `console.error`, no request id, no structured log. In production
  you'll get stack traces in stdout with no correlation. Add a logging
  layer (pino) and an error reporter.
- **U15. No tests outside domain math.** 21 tests, all in `domain/`. Zero
  tests for usecases, repos, handlers, or the auth token sign/verify round
  trip. The `verifyToken`/`createToken` pair is security-critical and
  untested.
- **U16. `plan.txt` is committed** and references "v3 — supersedes v2" and
  a decision log. It's 227 lines of planning prose that will rot. Move it
  to `docs/` or delete it; the README already covers the architecture.
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
