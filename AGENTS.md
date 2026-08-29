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
  src/money/                   money.ts, money.constants.ts (+ colocated tests)
  src/expense/                 allocate.ts + splits.ts — cent-exact split math,
                               run by the SERVER usecase and by the client for
                               its live per-person preview (one implementation)
  src/greeting.ts              time-of-day greeting
apps/web/                    Next.js app
  src/server/<domain>/       per-domain fan-out mirroring /proto:
    repo/                      ALL SQL (Postgres via pg). No business logic.
    usecase/                   ALL business logic. No SQL, no transport types.
    handler.ts                 thin Connect handler. No SQL, no business logic.
    <domain>.constants.ts      constants for this domain
  src/server/common/         db, errors, logger, rateLimit (shared infra)
  src/server/api/connect/    context.ts (auth/cookies/error map), routes.ts, csrf.ts
  src/pages/api/connect/     [[...connect]].ts — mount point only
  src/app/<route>/           UI (thin page.tsx → components/<Page>/ + hooks/)
  src/lib/                   app-specific utilities (api/ transport, auth/ guard,
                             hooks/ cross-route React hooks)
  src/components/            shell, ui primitives, providers, modals
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
- UI must NOT import `@/server/*/repo/*` or `@/server/common/db` — go
  through a usecase (server) or the Connect client (browser). The eslint
  `no-restricted-imports` rule enforces this; `src/pages/api/**` and
  `src/server/**` are exempt.

## Conventions (mandated, enforced)

- **Integer cents everywhere.** No floats for money. `int32` cents in proto,
  `INTEGER` columns in Postgres, `allocate()` in `@haalkhata/shared/expense/allocate.ts`.
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
  `<domain>.constants.ts` per domain. Frontend: route-scoped `constants/`
  or the owning folder's `*.constants.ts`.
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
  int32 limit_cents = 3;
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
`queryOne`, `execute`, `transaction`, `newId` from `@/server/common/db`.
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

Thin `ServiceImpl<typeof BudgetService>`. Each method:
`runUsecase(async () => budget.createBudget(await requireUser(context), request), context)`.
No SQL, no business logic. `requireUser` is async (awaits a token-version
DB read) — always `await` it. Pass `context` to `runUsecase` so unexpected
errors get logged with the RPC name.

### 7. Register the service: `src/server/api/connect/routes.ts`

```ts
import { BudgetService } from "@haalkhata/protogen/budgets/v1/budgets_pb";
import { budgetHandler } from "@/server/budgets/handler";
// …
router.service(BudgetService, budgetHandler);
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

| Command         | What it checks                                  |
|-----------------|-------------------------------------------------|
| `pnpm gen`      | buf generate → packages/protogen                |
| `pnpm typecheck`| tsc --noEmit                                    |
| `pnpm lint`     | eslint (layering + id-length + next rules)      |
| `pnpm test`     | vitest unit tests (domain math + auth tokens)   |
| `pnpm proto:lint`| buf lint + breaking                            |
| `pnpm doctor`   | react-doctor scan                               |
| `pnpm typecheck:mobile` / `lint:mobile` / `test:mobile` | same gates for apps/mobile |
| `pnpm typecheck:shared` / `lint:shared` / `test:shared` | same gates for packages/shared |

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit (the
`:mobile` variants when touching apps/mobile). Touching `packages/shared`
means running all three sets — it is compiled into both apps.

## Mobile app (apps/mobile)

Expo SDK 57 + expo-router. The same conventions apply — thin route files in
`app/` mount screen orchestrators from `src/screens/<route>/components/
<XScreen>/`, all server calls live in `useXAPI` hooks composed by `useX`,
constants sit in route-scoped `constants/` folders, pure helpers in `utils/`
with colocated tests. Mobile-specific rules:

- **Auth is bearer-token**, not cookies: LogIn/SignUp return `token`, stored
  in SecureStore (`src/lib/api/session.ts`) and attached by a transport
  interceptor. `Code.Unauthenticated` clears the session; the `(app)/_layout`
  gate redirects to /login. The server's CSRF guard exempts bearer clients.
- **Design tokens** come from `src/lib/theme/theme.ts` (the web's globals.css
  palette). No inline hex colors in screens.
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
- **Don't run migrations inside `query()`** — migrations run once at mount
  time via `ensureMigrated()`; the query hot path is just `pool().query()`.
- **Don't commit `packages/protogen/src/`** — it's gitignored and
  regenerated by `pnpm gen` (and by the Docker build).
- **Don't forget `Secure`/`SameSite=Lax`** — session cookies go through
  `sessionCookieAttributes()`; never build a Set-Cookie header by hand.
- **Security headers ship with Next.js** through `next.config.ts`; keep the CSP
  synchronized with Google Identity Services and avatar/receipt image sources.
- **Production guardrails** — `/api/health` must exercise token signing,
  migrations, and a live database query. Token signing requires at least 32
  decoded bytes of `SESSION_SECRET`; database work rejects `DATABASE_URL` with
  missing, placeholder, or shorter-than-16-byte credentials. Don't weaken these
  semantic checks into exact URL comparisons; Compose and direct deployments
  use different hosts.

## Deploy

Self-hosted Docker, two stacks. Migrations apply automatically in both, on
the first API request or readiness probe after start (`ensureMigrated()`);
the container itself does not run them at boot, and a failed run is retried
on the next request rather than poisoning the process.

**Dev** — `docker compose up -d --build`. Postgres 17 plus the standalone
image, web bound to `127.0.0.1:3000`, config from a plaintext `.env`. Set
`POSTGRES_PASSWORD` and `SESSION_SECRET` there before first boot.

**Production** — `docker compose -f docker-compose.prod.yml up -d --wait`,
with `Caddyfile` in front for TLS. Secrets come from `/run/secrets/` via
`ops/docker-entrypoint.sh`, never from `.env`. Only Caddy publishes ports.
Built by `.github/workflows/deploy.yml` and pushed to GHCR; the server pulls a
commit SHA over an SSH key restricted to `ops/deploy.sh` by a forced
`command=`. See `ops/README.md` and `docs/plan.txt` §7c.

Things not to break when touching deploy config:

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
