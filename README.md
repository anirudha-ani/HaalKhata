# হালখাতা HaalKhata

A Splitwise-style expense splitter — groups, one-off expenses, every split
type (equal / exact / percent / shares / itemized), multi-payer, balances
with min-cash-flow debt simplification, recorded settlements, and an **AI
receipt scanner** that turns a photo into assignable line items with tax +
tip split proportionally.

## Architecture

Schema-first monorepo. The API contract lives in `/proto` (ConnectRPC +
Protobuf); `buf` generates the TypeScript used by the server handlers, the
web client, and the React Native app — one contract, no drift.

```
proto/<domain>/v1/          the contract, one module per domain
                            (common, auth, group, expense, receipt, social)
packages/protogen/          @haalkhata/protogen — generated TS (do not edit)
packages/shared/            @haalkhata/shared — hand-written TS used by both
                            apps (query keys, money helpers, greeting)
apps/web/                   Next.js app
  src/server/<domain>/      per-proto fan-out (auth, group, expense, …), each:
    repo/                     ALL SQL (Postgres via pg, no ORM)
    usecase/                  ALL business logic (balances math in expense/domain/;
                              split math in @haalkhata/shared/expense/)
    handler.ts                thin Connect handler
  src/server/common/        db + shared errors
  src/server/api/connect/   transport context + routes.ts wiring
  src/pages/api/connect/    endpoint mount
  src/app/<route>/          thin page.tsx → components/<Page>/ + hooks/
apps/mobile/                Expo (React Native) app — same features, same API
  app/                      expo-router routes (thin, the page.tsx role)
  src/screens/<route>/      per-route fan-out: components/<XScreen>/ + hooks/
  src/lib/ src/components/  Connect transport (bearer auth), theme, shared UI
```

Layering: handlers have no SQL and no business logic; usecases have no SQL
and no transport; repos have SQL only. UI data access goes through TanStack
Query hooks (`useXAPI`) wrapping the typed Connect client.

## Run it

### One-command setup (fresh box)

```sh
./install-deps.sh   # installs Node, pnpm, Docker, buf, deps + generates protogen
./dev.sh            # starts db + web server at http://127.0.0.1:3000
```

`install-deps.sh` installs everything that's missing (skips what's already
there); `dev.sh` starts the Postgres db and the Next.js dev server. Use
`./dev.sh --clean` for a fresh database, `./dev.sh --down` to stop everything.

### Manual setup

```sh
pnpm install
pnpm gen                 # buf generate → packages/protogen
docker compose up -d db  # Postgres 17 on localhost:5432 (or use your own)
pnpm dev                 # http://localhost:3000
```

Pending migrations apply automatically on boot and the receipt scanner
falls back to a mock provider — no further configuration needed for a demo.
All configuration lives in a single `.env` at the repo root: `docker compose`
reads it directly, and `pnpm dev` loads it via Node's `--env-file-if-exists`.
Using your own Postgres instead of the compose service? Set `DATABASE_URL`
there. Real shell variables still win, so `DATABASE_URL=… pnpm dev` overrides
the file for a one-off.

### Mobile app (Expo)

```sh
./dev.sh --mobile-android   # boot emulator + build/install dev client + Metro + web server
./dev.sh --mobile-ios       # same for iOS simulator
```

The first run builds and installs the dev client (several minutes).
Subsequent runs reuse the emulator and installed app — Metro and the web
server start instantly. The dev client (not Expo Go) connects to Metro
automatically.

The app signs in with bearer tokens against the same `/api/connect`
endpoints. In dev it targets port 3000 on the machine running Metro, so
start the web server with `next dev -H 0.0.0.0` (or set
`EXPO_PUBLIC_API_URL=https://your-server`) when testing from a phone.

## Schema & migrations

The schema lives in plain SQL under `apps/web/migrations/` (node-pg-migrate,
history tracked in the `pgmigrations` table). The app applies pending
migrations once per process on startup, so dev and Docker never need a
manual migrate step. To change the schema:

```sh
pnpm db:new add_expense_receipts   # scaffolds migrations/<ts>_add-expense-receipts.sql
# edit the file: SQL under "-- Up Migration", inverse under "-- Down Migration"
pnpm db:migrate                    # apply now (or just restart the app)
pnpm db:down                       # roll back the most recent migration
```

Never edit an applied migration — add a new one.

## Deploy (self-hosted Docker)

Everything runs on any box with Docker — no managed platform, no vendor
lock-in:

```sh
cp .env.example .env     # set POSTGRES_PASSWORD + SESSION_SECRET
docker compose up -d --build
```

For a real deployment prefer Docker secrets over a plaintext `.env` for
`SESSION_SECRET`, `POSTGRES_PASSWORD` and `COMPATIBLE_AI_API_KEY`, and keep
only non-secret settings in the file.

That builds the Next.js standalone image and starts it with Postgres 17
(data in the `db-data` volume, app on port 3000). Put your usual reverse
proxy (Caddy/nginx/Traefik) in front for TLS.

### Receipt AI providers (optional)

Copy `.env.example` → `.env` and set:

- `COMPATIBLE_AI_BASE_URL` / `_API_KEY` / `_MODEL` — tier one: any endpoint
  speaking the OpenAI `/chat/completions` wire format. Production is
  OpenRouter; a Gemini compatibility endpoint or a self-hosted vision box work
  the same way.
- `COMPATIBLE_AI_ZDR=true` — request zero data retention, restricting routing
  to zero-retention endpoints. Receipt images are never stored by HaalKhata,
  so this hop is the entire privacy surface — also enforce ZDR account-wide in
  OpenRouter, which fails closed.
- `RECEIPT_AI_PROVIDERS` — failover order; default `compatible,mock`

One key, one endpoint: OpenRouter fronts Claude, Gemini and everything else
worth using here, so there is no provider-specific SDK in the codebase.

## Quality gates

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint (incl. layering import rules)
pnpm test        # vitest — split math & balance domain tests
pnpm proto:lint  # buf lint
pnpm doctor      # react-doctor scan

pnpm typecheck:mobile && pnpm lint:mobile && pnpm test:mobile   # same, for apps/mobile
pnpm typecheck:shared && pnpm lint:shared && pnpm test:shared   # same, for packages/shared
```

See `docs/plan.txt` for the full architecture plan and delivery phases.
