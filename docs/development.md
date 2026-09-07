# Development

How the code is laid out, how the schema changes, and which gates every
change passes. Conventions for contributors (and AI agents) live in
[`AGENTS.md`](../AGENTS.md); the backend is documented service by service
under [`docs/backend/`](backend/README.md).

## Architecture

Schema-first monorepo. The API contract lives in `/proto` (ConnectRPC +
Protobuf); `buf` generates the TypeScript used by the server handlers, the
web client, and the React Native app: one contract, no drift.

```
proto/<domain>/v1/          the contract, one module per domain
                            (common, auth, group, expense, receipt, social)
packages/protogen/          @haalkhata/protogen: generated TS (do not edit)
packages/shared/            @haalkhata/shared: hand-written TS used by both
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
apps/mobile/                Expo (React Native) app, same features, same API
  app/                      expo-router routes (thin, the page.tsx role)
  src/screens/<route>/      per-route fan-out: components/<XScreen>/ + hooks/
  src/lib/ src/components/  Connect transport (bearer auth), theme, shared UI
```

Layering: handlers have no SQL and no business logic; usecases have no SQL
and no transport; repos have SQL only. UI data access goes through TanStack
Query hooks (`useXAPI`) wrapping the typed Connect client. ESLint enforces
the import boundaries.

## Schema and migrations

The schema lives in plain SQL under `apps/web/migrations/` (node-pg-migrate,
history tracked in the `pgmigrations` table). The app applies pending
migrations once per process on startup, so dev and Docker never need a
manual migrate step. To change the schema:

```sh
pnpm db:new add_expense_receipts   # scaffolds migrations/<ts>_add-expense-receipts.sql
# edit the file: SQL under "-- Up Migration", inverse under "-- Down Migration"
pnpm db:migrate                    # apply now (or just restart the app)
```

Never roll a populated database backward: historical down migrations can
discard application data and merge audit records. Restore a verified backup
for disaster recovery, or add a forward corrective migration. Never edit an
applied migration; add a new one.

## Quality gates

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint (incl. layering import rules)
pnpm test        # vitest: split math & balance domain tests
pnpm proto:lint  # buf lint
pnpm doctor      # react-doctor scan

pnpm typecheck:mobile && pnpm lint:mobile && pnpm test:mobile   # same, for apps/mobile
pnpm typecheck:shared && pnpm lint:shared && pnpm test:shared   # same, for packages/shared
```

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs the same
commands on every push and pull request, plus a gitleaks scan over the full
history, `pnpm audit` for high-severity production advisories, and
`buf breaking` against the base branch so a pull request cannot break the
wire contract unnoticed. Every third-party action is pinned to a commit SHA.

## Related

- [Getting started](getting-started.md): run the stack locally, including
  the mobile app.
- [Self-hosting](self-hosting.md): the production stack and what it needs.
