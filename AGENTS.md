# AGENTS.md

Guide for AI agents (and human contributors) working on HaalKhata. Read this
before adding a domain or touching the server layer.

## What this is

A Splitwise-style expense splitter. Schema-first monorepo: the API contract
lives in `/proto` (ConnectRPC + Protobuf); `buf` generates TypeScript used by
the server handlers, the web client, and the mobile app. Single Next.js app
serves the UI (App Router) and the Connect API (`/api/connect/*`). Postgres
via `pg`, no ORM. Self-hosted Docker deploy. An Expo (React Native) app in
`apps/mobile` consumes the same API with bearer-token auth.

## Repo layout

```
proto/<domain>/v1/           THE contract — one module per domain
buf.yaml / buf.gen.yaml      codegen → packages/protogen (regenerated, gitignored)
packages/protogen/           @haalkhata/protogen — generated TS (do NOT edit, do NOT commit)
packages/shared/             @haalkhata/shared — hand-written TS used by BOTH apps
  src/api/queryKeys.ts         query-key registry + MONEY_KEYS invalidation set
  src/api/wireNumbers.ts       the API's int64 money ⇄ plain numbers, by schema;
                               plainClient.ts wraps both apps' Connect clients,
                               plainMessages.ts names the plain message types
  src/money/                   money.ts, money.constants.ts (+ colocated tests)
  src/expense/form/            shared form validation, payloads, previews and warnings
  src/expense/                 allocate.ts + splits.ts — cent-exact split math,
                               run by the SERVER usecase and by the client for
                               its live per-person preview (one implementation);
                               merge/ (editing together) and live/ (live splits)
  src/payment/                 payment methods: detail kinds, starting points,
                               the validator (server + both forms), the form's
                               reducer, payer ordering and formatting
  src/analytics/               chart.ts (axis ceilings, bar lengths, tick text)
                               and insights.ts (wording, ranges, tail folding)
                               for the Insights dashboard on both apps
  src/email/                   the one email check (isEmailAddress, canonicalEmail)
  src/receipt/                 the receipt photo standard both apps prepare to
                               and the server checks
  src/greeting.ts              time-of-day greeting
apps/web/                    Next.js app
  src/server/<domain>/       per-domain fan-out mirroring /proto:
    repo/                      ALL SQL (Postgres via pg). No business logic.
    usecase/                   ALL business logic. No SQL, no transport types.
    handler.ts                 thin Connect handler. No SQL, no business logic.
    <domain>.constants.ts      constants for this domain
  src/server/common/         shared infra: db/, ledger/, secrets/,
                             rateLimit/, validation/, readiness/
  src/server/api/connect/    routes.ts (each service, with its request cap and gate),
                             context.ts (requireUser, session cookies, runUsecase),
                             wire/ (plainService: handlers in plain numbers),
                             connect.constants.ts; mount/ (what runs before a
                             handler: mount options, CSRF, body deadline), session/
                             (credentials), rateLimit/ (per-RPC limits), admin/ (the
                             admin services' host/origin checks)
  src/config/                securityHeaders.ts (CSP) and adminSurface.ts (which
                             hostname reaches the admin page and its APIs)
  src/pages/api/connect/     [[...connect]].ts — mount point only
  src/app/<route>/           UI (thin page.tsx → components/<Page>/<Page>.tsx,
                             with its own components/, hooks/, constants/, utils/)
  src/lib/                   app-specific utilities (api/ transport, auth/ guard,
                             hooks/ cross-route React hooks, googleIdentity/
                             Google's sign-in script for the app and admin pages)
  src/components/<category>/ shared UI by category (ui, shell, people, modals,
                             providers, …): one folder per component,
                             <Name>/<Name>.tsx — see "Composition structure"
  migrations/                plain SQL, node-pg-migrate (history in pgmigrations)
apps/mobile/                 Expo (React Native) app — @haalkhata/mobile
  app/                       expo-router routes — THIN (the page.tsx role)
  src/screens/<route>/       per-route fan-out mirroring the web pattern:
                               components/<XScreen>/ (+hooks/), constants/, utils/
  src/components/            ui primitives, shell (tabs/headers), modals, providers
  src/lib/                   api/ (Connect transport + bearer session),
                             theme/ (design tokens), encoding/, polyfills/
```

## Layering rules (enforced by ESLint)

- `api/connect` handlers: decode request → call usecase → encode response.
  No SQL, no business logic. `routes.ts` wires services to the router.
- `usecase`: pure TypeScript business logic. No SQL, no transport types
  beyond generated proto messages. Balance math lives in `usecase/domain/`;
  split math is in `@haalkhata/shared/expense/` (the client previews with it).
- `repo`: SQL only. No business decisions.
- Within a crowded domain/layer, group by capability (for example
  `auth/usecase/apple/`, `deletion/`, `phone/`, `session/`). Keep
  tests beside the implementation. Shared infrastructure uses concern
  folders under `common/`; do not flatten it back into one directory.
- UI must NOT import `@/server/*/repo/**` or `@/server/common/db/**` — go
  through a usecase (server) or the Connect client (browser). The eslint
  `no-restricted-imports` rule enforces this; `src/pages/api/**` and
  `src/server/**` are exempt.

## Conventions (mandated, enforced)

- **Integer cents everywhere.** No floats for money. `int64` cents in proto,
  `BIGINT` columns in Postgres, `allocate()` in `@haalkhata/shared/expense/allocate.ts`.
  The code itself only sees plain numbers: every service registers through
  `plainService` and every client is made with `plainClient`, which convert
  protobuf-es's `bigint` at the boundary. Import a money-bearing message type
  from `@haalkhata/shared/api/plainMessages`, never from protogen, in UI and
  shared code.
- **Server-recomputed splits.** Never trust client-supplied split amounts;
  recompute from the raw spec in the usecase.
- **Transactions where they matter.** `insertExpense` / `replaceExpense` /
  `insertGroup` / `insertNotifications` run inside `transaction()` with
  ROLLBACK on throw.
- **Parameterized SQL everywhere.** `$1` placeholders, never string concat.
- **Identifiers ≥ 4 characters**, no abbreviations (eslint `id-length`).
  DB-column and proto property names are exempt.
- **Every file has a header doc comment; every exported symbol and
  non-trivial internal function carries JSDoc (`@param`/`@returns`).**
- **Constants never inline between functions.** Server: one
  `<domain>.constants.ts` per domain. Frontend: a file in the `constants/`
  folder of the component (or route) that owns it — never a `*.constants.ts`
  beside the component.
- **Composition structure (apps/web UI).** Every component has its own
  folder and root file, `<Name>/<Name>.tsx`. A folder is either a *category*
  that holds only component folders (`src/components/ui/`) or a *component*
  with its root file; never loose files beside folders. Whatever a component
  needs lives in subfolders of the component that owns it:
  `components/<Child>/<Child>.tsx`, `constants/<topic>.ts`,
  `utils/<name>.ts` (tests colocated) and `hooks/use<Name>.ts`. One
  component, hook or helper per file — no private sub-components at the
  bottom of another component's file. Route folders hold only Next's own
  files (`page.tsx`, `loading.tsx`, `layout.tsx`, `error.tsx`) and those
  same four subfolders, and a `page.tsx` mounts a component rather than
  being one.
- **Nothing fails silently.** Every action a person takes ends in feedback
  they can see: a failure is shown beside the control that caused it (or in
  the pinned `ErrorPopup`), never only in the console, in state nothing
  renders, or in a spot that can be off screen — a line under a long list is
  off screen. Every mutation has an `onError` that reaches the UI. When the
  client already knows an action will be refused (a member with an unsettled
  balance cannot leave a group), it says why, with the numbers, instead of
  sending the request and reporting the refusal. Applies to both apps.
- **A settle button settles what it sits beside.** Beside a total (a person
  on Home or Friends, the headline on their page) it settles everything with
  that person on the net; beside one balance (a group's page, a row of
  "Where the balance sits") it settles that balance alone. The dialog lists
  exactly what it covers and offers nothing to tick — no checklist that
  widens a group's settle or narrows a person's. Both apps read the same
  `readSettlePositions` in `@haalkhata/shared/expense/settlePosition`.
- **No Claude co-author or attribution on commits or PRs.** Never add a
  `Co-Authored-By: Claude …` trailer, a "Generated with Claude Code" line, or
  a session link. A commit is authored by the person whose git identity made
  it, and nobody else is named. Three things hold this: `.claude/settings.json`
  turns Claude Code's attribution off, the `commit-msg` hook in `.githooks`
  strips such a line from any commit however it was made, and this rule covers
  everything else. A fresh clone enables the hook with
  `git config core.hooksPath .githooks` (`install-deps.sh` does it).
- **Soft-delete on expenses** (set `deleted_at`); balances filter
  `deleted_at IS NULL`.
- **Auto-migrate before API readiness** runs through `ensureMigrated()` on
  `/api/health` and each Connect request — never edit an applied migration,
  add a new one.
- **Cross-app client code goes in `@haalkhata/shared`, never duplicated.**
  If web and mobile both need a helper, it belongs in `packages/shared/src/`.
  Admission rule: pure TypeScript, no React / React Native / DOM / Node APIs,
  and genuinely needed by both. UI primitives and the Connect transports stay
  per-app (different renderers, cookie vs bearer auth). The package's eslint
  config bans `window`/`document`/`process` to keep this honest.

## How to add a new domain

Example: adding a `budgets` domain. Follow every step; do not skip.

### 1. Define the contract

Create `proto/budgets/v1/budgets.proto`:

```proto
syntax = "proto3";
package budgets.v1;
import "google/protobuf/empty.proto";
import "common/v1/common.proto";

service BudgetService {
  rpc CreateBudget(CreateBudgetRequest) returns (Budget);
  rpc ListBudgets(google.protobuf.Empty) returns (ListBudgetsResponse);
}

message Budget {
  string id = 1;
  string name = 2;
  int64 limit_cents = 3;
  // …
}
// … request/response messages
```

Then **regenerate**:

```sh
pnpm gen    # buf generate → packages/protogen/src/budgets/v1/budgets_pb.ts
```

The generated file is gitignored — never commit it, never edit it.

### 2. Add the migration

```sh
pnpm db:new add_budgets_table   # scaffolds migrations/<ts>_add-budgets-table.sql
```

Edit the file: SQL under `-- Up Migration`, inverse under `-- Down Migration`.
Add `CHECK` constraints for any money/quantity columns and indexes for the
read paths you'll add. Never edit an applied migration.

### 3. Repo layer: `src/server/budgets/repo/budgets.repo.ts`

SQL only. Define a `<Entity>Row` interface (column names mirror SQL), then
`insertBudget` / `findBudgetById` / `listBudgets` etc. Use `query`,
`queryOne`, `execute`, `transaction`, `newId` from `@/server/common/db/db`.
No business logic, no validation beyond what the DB enforces.

### 4. Usecase layer: `src/server/budgets/usecase/budget.usecase.ts`

All business logic. Import repo functions and the generated proto types.
Throw `UsecaseError` (via `invalid`/`notFound`/`denied` from
`@/server/common/errors`) on validation/auth failures — `runUsecase` maps
these to Connect codes. No SQL, no transport types beyond proto messages.

Authorisation belongs here: check membership/ownership before mutating
(see `assertGroupOwner` in `group.usecase.ts` and `assertCanModify` in
`expense.usecase.ts`).

### 5. Constants: `src/server/budgets/budgets.constants.ts`

Allowlists, limits, patterns for the domain — e.g. `BUDGET_TYPES`,
`MAX_BUDGETS_PER_GROUP`. Never inline between functions.

### 6. Handler: `src/server/budgets/handler.ts`

Thin `PlainServiceImpl<typeof BudgetService>` (from
`api/connect/wire/plainService`: requests and responses in plain numbers).
Each method: `runUsecase(async () => budget.createBudget(await requireUser(context), request), context)`.
No SQL, no business logic. `requireUser` is async (awaits a token-version
DB read) — always `await` it. Pass `context` to `runUsecase` so unexpected
errors get logged with the RPC name.

### 7. Register the service: `src/server/api/connect/routes.ts`

```ts
import { BudgetService } from "@haalkhata/protogen/budgets/v1/budgets_pb";
import { budgetHandler } from "@/server/budgets/handler";
import { plainService } from "./wire/plainService";
// …
router.service(BudgetService, plainService(BudgetService, budgetHandler));
```

### 8. UI: `src/app/<route>/`

Thin `page.tsx` → `components/<Page>/` → `hooks/useXAPI` (TanStack Query
wrapping the typed Connect client from `@/lib/api/connect`). Add query keys
to `@/lib/api/queryKeys.ts`. Components never call the Connect client
directly — only through a `useXAPI` hook. Add a `loading.tsx` for the route.

### 9. Verify

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint (incl. layering import rules)
pnpm test        # vitest — domain-math tests live beside the math they cover
pnpm proto:lint  # buf lint
```

All four must pass before committing.

## Quality gates

Every new user-facing behavior must have a documented local execution and
verification path, including provider environment variables when needed.
Use real provider flows locally; test fixtures must not bypass production
authentication. See `docs/local-auth.md` for Google and Apple sign-in.

| Command         | What it checks                                  |
|-----------------|-------------------------------------------------|
| `pnpm gen`      | buf generate → packages/protogen                |
| `pnpm typecheck`| tsc --noEmit                                    |
| `pnpm lint`     | eslint (layering + id-length + next rules)      |
| `pnpm test`     | vitest unit tests (domain math + auth tokens)   |
| `pnpm proto:lint`| buf lint + breaking                            |
| `pnpm test:parity` | browser/native Connect feature entry-point parity |
| `pnpm run doctor` | react-doctor scan (`pnpm doctor` without `run` is pnpm's own self-check, not this) |
| `pnpm typecheck:mobile` / `lint:mobile` / `test:mobile` | same gates for apps/mobile |
| `pnpm typecheck:shared` / `lint:shared` / `test:shared` | same gates for packages/shared |

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit (the
`:mobile` variants when touching apps/mobile). Touching `packages/shared`
means running all three sets — it is compiled into both apps.

## Mobile app (apps/mobile)

Expo SDK 58 + expo-router. The same conventions apply — thin route files in
`app/` mount screen orchestrators from `src/screens/<route>/components/
<XScreen>/`, all server calls live in `useXAPI` hooks composed by `useX`,
constants sit in route-scoped `constants/` folders, pure helpers in `utils/`
with colocated tests. Mobile-specific rules:

- **Feature parity is total.** Every user-facing capability on the web
  exists on mobile — a feature that lands on one app and is "tracked" for
  the other is a gap, not a plan (docs/plan.txt §27). Pure logic both apps
  need (filters, wording, formatting, phone helpers) goes in
  `packages/shared` with its tests, never written twice. The only
  native-only RPCs are `LogInWithApple` and `RegisterDevice` (a browser
  has no Apple credential or Expo push token); `pnpm test:parity` names both.
  The one page with no mobile twin is the operator's admin page (`/admin`:
  usage and reports): it is not a user feature, and it is deliberately
  reachable from one hostname only.
- **Auth is bearer-token**, not cookies: LogInWithGoogle (production) or
  LogIn/SignUp (development only) return `token`, stored
  in SecureStore (`src/lib/api/session.ts`) and attached by a transport
  interceptor. Google sign-in uses `expo-auth-session`'s Google provider with
  the platform's native client id (`EXPO_PUBLIC_GOOGLE_{ANDROID,IOS}_CLIENT_ID`
  at build time; the server accepts them through `GOOGLE_MOBILE_CLIENT_IDS`)
  and the same server-issued nonce as the web. Sessions renew themselves: once a token is past half its
  seven-day life, any authenticated RPC returns a fresh one (a cookie for
  the browser, the `x-haalkhata-session` header for mobile, which the
  interceptor stores). `Code.Unauthenticated` clears the session; the `(app)/_layout`
  gate redirects to /login. The server's CSRF guard exempts bearer clients.
- **Design tokens** come from `src/lib/theme/theme.ts` (the web's globals.css
  palette). No inline hex colors in screens.
- **Motion and haptics go through `src/lib/motion/`.** Springs and durations
  are tokens in `motion.constants.ts`; entrances and step transitions are the
  prebuilt builders in `entrances.ts`; follow Reduce Motion with
  `useReduceMotion` (a fade, never a jump) and animate on the UI thread.
  Haptics mark outcomes only (`haptics.ts`). Vitest aliases Reanimated and
  expo-haptics to stand-ins in `src/lib/testing/`.
- **Onboarding asks once, after saying why.** The screen before an iOS
  permission alert has one button, Continue; the alert is where people say
  no (App Review 5.1.1(iv)). Device steps (contacts, notifications) run after
  a sign-in on each phone, never on an app update. See
  `docs/mobile-onboarding.md`.
- **Query keys and money helpers are imported, not copied.** They live in
  `@haalkhata/shared` and are consumed identically by both apps. These were
  duplicated files kept in sync by hand until 2026-07-26 — do not reintroduce
  a local copy.
- Dev: `./dev.sh --mobile-android` (or `--mobile-ios`) does the full
  end-to-end flow: boots an emulator/simulator if none is running, builds +
  installs the dev client via `expo prebuild` + `gradlew installDebug`
  (Android) or `expo run:ios --no-bundler` (iOS) if the app is missing,
  starts Metro in the background, launches the app, then starts the web
  server in the foreground. Subsequent runs are instant — the emulator and
  installed app are reused. Re-run with a clean `android/` (delete
  `apps/mobile/android`) only when native dependencies change. The API base
  URL derives from the Metro host (port 3000) in development; release builds
  require an HTTPS `EXPO_PUBLIC_API_URL` and native config blocks cleartext.
  Native-module versions must match the SDK — check with
  `npx expo install --check`.

## Common pitfalls

- **Don't `await requireUser()`** — wait, DO `await` it. It's async (reads
  `token_version` from the DB). Forgetting `await` passes a Promise to the
  usecase and silently breaks auth.
- **Don't trust client split amounts** — recompute in the usecase.
- **Don't add a `for` loop of `INSERT`s** — use the `multiRowValues` helper
  in `expenses.repo.ts` for bulk inserts.
- **Find a person's expenses with `expenseInvolvesSql`** (in
  `expense/repo/expenseInvolvement.ts`), never an `EXISTS (… UNION …)`
  checked against each expense: that form cannot use the per-person indexes
  and reads every expense in the app for one person's list.
- **Don't run migrations inside `query()`** — migrations run once at mount
  time via `ensureMigrated()`; the query hot path is just `pool().query()`.
- **Don't commit `packages/protogen/src/`** — it's gitignored and
  regenerated by `pnpm gen` (and by the Docker build).
- **Don't forget `Secure`/`SameSite=Lax`** — session cookies go through
  `sessionCookieAttributes()`; never build a Set-Cookie header by hand.
- **Security headers ship with Next.js** through `next.config.ts`; keep the CSP
  synchronized with Google Identity Services and avatar/receipt image sources.
- **Production guardrails** — `/api/health` must exercise token signing,
  migrations, a live database query and — with password auth off — that a
  Google audience exists and matches the client id built into the bundle.
  Token signing requires at least 32 decoded bytes of `SESSION_SECRET`;
  database work rejects `DATABASE_URL` with missing, placeholder, or
  shorter-than-16-byte credentials. Don't weaken these semantic checks into
  exact URL comparisons; Compose and direct deployments use different hosts.
- **Don't read a secret from `process.env`** — go through `readSecret()` in
  `common/secrets/secrets.ts`, which honours the Docker `<NAME>_FILE` convention
  production relies on. That includes the full database URL, which carries
  the password: `DATABASE_URL_FILE` wins over `DATABASE_URL`. Without either
  the pool assembles its URL from `POSTGRES_PASSWORD(_FILE)` and the
  `POSTGRES_*` parts.
- **A request is capped and gated before it is read.** Connect reads,
  unzips and decodes a body before any of the app's code runs, so the mount
  (`api/connect/mount/mountOptions.ts`) caps every request at 64 KiB after
  decompression, drops fields no message defines, and runs a request gate
  that refuses a call without a validly signed session before reading its
  body. A service whose legitimate requests are bigger gets its own cap in
  `routes.ts`, with the arithmetic in `connect.constants.ts` and a case in
  `mount/requestCaps.test.ts`. A call that works without a session is listed
  in its service's `ANONYMOUS_*_RPCS` and its service gets its own gate
  (auth and social do; the admin services' gate is `requireAdminPageRequest`);
  `mount/requestGates.test.ts` fails when a handler that never asks for a
  session is not listed, so a new anonymous call is never silently refused.
- **A receipt photo is prepared on the device; the server never decodes
  one.** Both apps turn any photo, HEIC and 200 MP camera JPEGs included,
  into the standard in `@haalkhata/shared/receipt/receipt.constants` (a JPEG,
  upright, at most 2576 px, no metadata): the web in the browser, with libheif
  in a Web Worker for a HEIC the browser cannot open; mobile with
  `expo-image-manipulator`. `receipt/usecase/image/preparedJpeg.ts` checks
  the standard from the JPEG's headers, refuses anything else, strips EXIF
  and forwards the bytes. A file's size says nothing about what it unpacks
  to (a 20 KB HEIC can need 600 MB), which is why no upload is decoded here.
  Never add an image decoder to the server; change the standard in shared
  and both apps instead. Scans run in lanes (`receipt/usecase/scanLanes`):
  6 at once per process, then a short line, one per person, and a scan
  stops when its request goes away. The 5-a-minute allowance is spent only
  once a scan has a lane, so being told "busy" costs nothing.
- **There is one email check.** Whether text is an email address is
  `isEmailAddress` (or `canonicalEmail`, which also trims and lower-cases)
  in `@haalkhata/shared/email/email`; the server, the contacts lookup and the
  payment-method form all call it. It measures the standard's lengths (254,
  and 64 before the `@`) before it reads the shape, and the shape is loose,
  something@something.something, because Google or Apple verified every
  address that has an account. Never write another email pattern: one whose
  parts can match the same characters takes seconds to refuse a long field,
  and the server answers nobody while it does.
- **An edit is a merge, not a replacement.** Several people can edit one
  expense at once. A form sends what it opened (`base`) with what it wants,
  and `mergeExpenseEdit` in `@haalkhata/shared/expense/merge` applies this
  person's changes to the expense as it stands, part by part: each text field,
  tax, tip, who paid, a receipt line's details, and each person's portion of a
  line; on an expense that is not itemized the amount and split are one part.
  Only a part two people changed to different values stops the save, as
  `Code.Aborted` with nothing written, and the apps read the latest and offer
  Keep mine or Use theirs. Receipt lines keep their ids across edits, which is
  what makes a line the same line. Compare money with `sameMoney`, never by
  cents: an equal split gives its odd cent to whoever the form listed first. A
  form asks `GetExpenseVersion` every 10 s and folds in what it can
  (`useExpenseEditSync`, one per app, over the shared `catchUpForm`).
- **A live split is an ordinary expense with the door open.** One itemized
  expense, 30 minutes (`LIVE_SPLIT_MINUTES`), and it adds no rule the bill would
  not have anyway: any number of people can have paid, the normal form still
  edits it, and nobody has to settle. People come in through a `live` invite
  link (accounts only, as ever; on a group's bill joining joins the group, which
  the join page says first; on a one-off it befriends them with whoever started
  it and whoever paid). Every tap is a merged `UpdateExpense` through `liveEdits`
  in shared, sent one at a time. While one runs, what each person paid follows
  the total (`fitPayers`), so nothing is refused for not adding up, and somebody
  who starts paying is befriended with everyone on a one-off, or they could
  never settle. Lines may have nobody on them only while one runs, and such a
  line counts against whoever paid, by what each paid (`unclaimedOnPayers`), so
  the ledger is exact at every moment and the end moves no money:
  `closeLiveSplit` writes those lines to the payers and announces the result
  once. Nothing is announced before that, so nobody's phone buzzes per tick.
  `live_split_people` is what lets somebody with no share yet read and edit, and
  is deleted when it ends. A split rereads `GetExpense` on every tap on every
  phone, so nothing that reads a group's history belongs in it: who a person
  still owes is `ListOwedPeople`, keyed on their own debt (`billDebts`). See
  `docs/live-split.md`.
- **An expense never changes currency.** `updateExpense` keeps the saved
  currency, group expenses included, and refuses an edit naming another;
  the forms work in it when editing (`expenseFormCurrency` puts the saved
  currency first). Converting is never the server's job.
- **Money is per currency.** Balance maps are keyed by currency
  (`CurrencyCents` in `balance.usecase.ts`), responses carry `CurrencyAmount`
  buckets, and the legacy scalar fields are only the caller's default-currency
  bucket. Never add cents across currencies.
- **Every figure stays below 2^53.** One amount is at most `MAX_MONEY_CENTS`
  (10^13, also a database CHECK), and `assertRoomInLedgers` refuses an
  expense that takes anyone's expenses in one currency past
  `MAX_PERSON_VOLUME_CENTS` (10^15). That is what keeps every balance and
  total exact as a JavaScript number, so a new write path that stores an
  expense must call it too; a new aggregate needs no check of its own.
- **Side effects go in the transaction.** Activity, notification and
  friendship rows are written on the same `client` as the ledger change that
  announces them; repo insert functions take an optional `client` for that.
- **Money mutations need an `operation_id`.** `CreateExpense` and
  `RecordSettlement` require a client UUID (`assertOperationId` in the
  handler); the usecase claims it with `beginOperation` inside the ledger
  transaction and `finishOperation` before commit, so a retry replays the
  stored result. Clients mint one per submit (`newOperationId()`).
  `UpdateExpense` and `AddComment` use the same claim, so a retry neither
  saves nor announces twice, and accept none from an older app. Claim
  first, before any ledger lock, and never touch another claim in a money
  write: claims past 24 hours are cleared by the background sweep
  (`common/ledger/operationsSweep.ts`), because a write that cleared them
  itself queued every other money write behind it and deadlocked with
  a payment.
- **A payment locks only what it can touch, and never waits for long.**
  Recording a payment between two people locks the active groups they share
  (`sharedActiveGroups`), never every group either is in, reads that set
  again under the locks and starts over if it grew; a payment to somebody
  owed nothing is refused before any lock. Nobody can be in more than 200
  groups (`MAX_GROUPS_PER_PERSON`, checked in `group/usecase/groupLimit.ts`
  wherever someone joins). `withLedgerTransaction` gives every ledger
  transaction a 5 s lock and 15 s statement limit and answers either, or a
  deadlock Postgres broke, as busy with nothing saved. A new ledger path takes the fewest locks the
  change needs, through `withLedgerTransaction`.
- **A balance is read at one instant.** It is assembled from several
  statements, and a settlement committing between two of them yields a
  position that never existed. Every read that returns a figure
  (`getFriendLedger`, `getOverallBalances`, `getGroupBalances`,
  `listExpenses`, `getExpense`) runs inside `snapshot()` from `common/db/db.ts`
  and passes its `client` to every statement, one at a time — one sent to
  the pool reads outside the snapshot and holds a second connection.
  Never open a snapshot or transaction, or send a pool query, inside
  another transaction: read the balance first, then open the transaction.
  `connectionHold.ts` refuses it outside production and logs it in it.
- **A net settlement is one unit.** Its cash and `offset` rows share a
  `net_settlements` parent and a deferred constraint trigger refuses a unit
  that does not cancel out or is only partly removed. Never insert, update
  or soft-delete one of its rows alone: go through `storeNetSettlement` and
  `softDeleteNetSettlement`. A net settlement must carry the
  `position_digest` the person was shown; the write recomputes it under the
  locks and refuses a ledger that has moved.
- **Nobody exists before signing up.** AddFriend and AddMembers find only
  accounts; an email or phone with none is refused (`failed_precondition`)
  and the clients offer the caller's profile link or the group's join link.
  Never create a row for a stranger, and never add a path that claims or
  merges one row into another (sign-up, phone verification or a link).
  `chk_users_can_sign_in` refuses a live row with no password, Google or
  Apple credential; the only credential-less rows are the "Deleted member"
  stand-ins account deletion leaves. Invite links are `group`, `profile` or
  `live`; a group link works for 7 days (`GROUP_INVITE_LINK_LIFETIME_DAYS` in shared)
  and then answers `FailedPrecondition`, which both join pages show as
  expired, with what to do.
- **A person's payment methods reach only someone who owes them.** They are
  not on `User`. The one read of another person's methods is
  `listPayeeMethods`, called from `getFriendLedger` when the caller owes in
  any currency or inside any one scope. Never add them to a user projection,
  a list response, a notification or an activity row: a reminder names the
  method and stops there, and a settlement keeps only the method's name.
- **A payment method is defined by its owner, not by this codebase.** A new
  wallet or a bank in another country is a `custom` detail with its own
  label, never a new kind, a new preset or a per-country rule. The kinds are
  a closed set, listed once in `packages/shared/src/payment/detailKinds.ts`
  and repeated in the database CHECK; validation is the shared
  `checkPaymentMethod`, which both forms and the server run.
- **A payment method's text is read by someone other than who typed it.**
  The shared validator measures every field before it trims, matches or
  parses it (a megabyte in a field must cost nothing), removes characters
  nobody can see, and refuses labels that ask for a secret. Add a field or a
  kind there, not in a form. An "Open Venmo" link carries the amount only
  when the app would read it as the money owed: `appPaymentLink` checks the
  app's currencies, the method's currency and the decimals, and returns the
  line shown with the link. Never build such a link by hand.
- **Every bell row is a push.** `insertNotifications` queues a `push_outbox`
  row on the caller's transaction, and the push worker (started by
  `src/instrumentation.ts`) sends it through Expo. Never call the push
  provider from a usecase. A new notification kind needs a category in
  `packages/shared/src/notifications/categories.ts` and the DB CHECK; until
  it has one it is never pushed. A push carries only `notificationId`,
  `link` and `recipientId` as data. See `docs/backend/push/push-service.md`.
- **Limiters are process-local** (`rateLimit.ts`, `phoneRateLimit.ts`): fine
  for one container, wrong for two replicas — see `docs/plan.txt` §28. Use
  the right table: `addressRateLimits` for a caller not signed in, keyed by
  `clientNetwork()` (never the raw address: an IPv6 caller has a whole /64),
  `accountRateLimits` for a signed-in one, `adminRateLimits` for the admin
  page. Anonymous callers can flood their table; they cannot touch the
  others. A limit that guards a secret belongs in Postgres.
- **The admin surface is a hostname, and it is checked three times.**
  `requestSurface()` in `config/adminSurface.ts` decides whether a request
  is on the app or the admin page, and the page proxy, the Connect mount and
  the admin handlers each ask it. On `ADMIN_HOST` only the admin page,
  `AdminAnalyticsService` and `AdminModerationService` exist; everywhere
  else none of them does. A new admin service goes in `ADMIN_RPC_PREFIXES`
  and starts every method with `requireAdminPageRequest` and the admin
  session (`api/connect/admin/adminRequest.ts`). A new page or
  service lands on the app surface by default and needs nothing. Do not add
  a second mount of `routes`, an exception to the gate, or a redirect where
  it answers 404. Do not rewrite to the admin page from the proxy either:
  Next resolves a rewrite against the address the server is bound to and
  can send it back in under the wrong hostname.
- **An admin is not a user.** The admin session is an allowlisted Google
  identity (`ADMIN_EMAILS`) with its own cookie and its own table. Never
  accept an app session, a bearer token, or a `users` row as proof of it,
  and never let the admin sign-in create or link an account.
- **The app and the admin page are the same site.** `SameSite` does not
  separate `haalkhata.app` from `admin.haalkhata.app`: a request to the
  admin host started on the app's hostname carries the admin cookie. Every
  admin RPC therefore checks that `Origin` equals `Host` itself, with no
  bearer exemption, and the admin host sends no CORS header. Keep both.
- **The usage overview is counts and display names, enforced in SQL.** No
  statement in `adminanalytics/repo/usage.repo.ts` selects an email, phone,
  avatar, id, amount, description, group name or anything about a payment
  method beyond how many exist, and an integration test searches the whole
  response for them. A display name that is itself an
  email address, a phone number or the start of the person's email is
  withheld in the same SQL. A new figure there is a new count; if it needs
  a column a person would call private, it does not belong on that page.
- **The report queue shows what was reported, never who reported it.**
  `adminmoderation/repo/moderation.repo.ts` takes the words out of the
  report's server-made snapshot field by field, names the author through
  the same withholding rule (`adminanalytics/repo/displayName.ts`), and
  never selects `reporter_id` or any id but a report's own. Its removal
  mirrors `safety/repo/moderation.sql` (what `ops/moderate.sh` runs), and
  `moderationParity.integration.test.ts` runs both on the same data: change
  one, change the other.
- **Analytics are counted, not collected.** Personal insights and the usage
  overview are aggregates over rows the product already keeps. The single
  purpose-built tally is `receipt_scans` (who, when, parsed or failed),
  because a scan otherwise leaves no trace. Do not add event tracking,
  last-seen timestamps or per-person timelines to answer a usage question.
- **Charts are plain elements.** The column chart and bar list in
  `components/charts` (both apps) draw with divs/Views sized by
  `@haalkhata/shared/analytics/chart`; there is no chart library. One colour
  per series, every value also available as text, no second axis.

## Deploy

Self-hosted Docker, two stacks. Migrations apply automatically in both, on
the first API request or readiness probe after start (`ensureMigrated()`);
the container itself does not run them at boot, and a failed run is retried
on the next request rather than poisoning the process.

**Dev** — `docker compose up -d --build`. Postgres 17 plus the standalone
image, web bound to `127.0.0.1:3000`, config from a plaintext `.env`. Set
`POSTGRES_PASSWORD` and `SESSION_SECRET` there before first boot.

**Production** — `docker compose -f docker-compose.prod.yml up -d --wait`,
with `Caddyfile` in front for TLS. Secrets are mounted at `/run/secrets/`
and named to the app through `*_FILE` variables (`readSecret()`); nothing
exports them into the environment and none belong in `.env`. Only Caddy
publishes ports.
Built by `.github/workflows/deploy.yml` and pushed to GHCR; the server pulls a
commit SHA over an SSH key restricted to `ops/deploy.sh` by a forced
`command=`. That file is a fixed launcher that runs the deploy steps baked
into the image (`ops/deploy-release.sh`, at `/opt/release/`). See
`ops/README.md` and `docs/plan.txt` §7c.

Things not to break when touching deploy config:

- **Deploy logic goes in `ops/deploy-release.sh`, not `ops/deploy.sh`.** The
  launcher cannot be updated through the deploy key, so changing it means a
  manual copy to the server. Which piped keys are accepted, which secret files
  they become and how the compose file is adopted all live in the release's
  own deploy steps; a new pipeline-managed key is a release (see "Adding a
  pipeline-managed key" in `ops/README.md`). Keep the launcher's contract
  (SHA, release directory, untouched stdin) stable.

- **`header_up X-Forwarded-For {remote_host}` in the Caddyfile.** `clientIp()`
  reads the first value of that header and Caddy appends by default, so
  without the overwrite a caller picks their own rate-limit bucket.
  `TRUST_PROXY_HEADERS=true` belongs only in the same trusted-proxy stack;
  direct deployments must leave it false and use the mount-injected peer IP.
- **Don't rewrite `Host`.** `csrfGuard()` compares `Origin` against
  `request.headers.host`; a proxy that rewrites Host 403s every browser POST.
- **`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is a build arg, not a runtime value.** It
  is inlined by `next build`. Wrong at build time means a total sign-in
  lockout, because password auth is off in production.
- **Don't add `mock` to `RECEIPT_AI_PROVIDERS` in production.** A fallback
  that invents line items on a real receipt is worse than a visible failure.
