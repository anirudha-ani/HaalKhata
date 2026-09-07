# হালখাতা HaalKhata

**Split expenses with the people in your life, and always know who owes whom.**

HaalKhata is a self-hosted, open-source expense splitter for the web and for
your phone. Trips, households, dinners, one-off IOUs: put the expense in
once, let everyone see the same balances, and settle up when you are ready.
A *haal khata* is the fresh ledger a Bengali shopkeeper opens each new year,
once the old accounts are settled. That is the feeling this app is after.

A hosted instance runs at [haalkhata.app](https://haalkhata.app). Or run
your own: one Docker command, on any box.

## Why HaalKhata

- **Yours to run.** Your ledger lives on your server and is never sent to a
  third party. The outside services involved are Google for sign-in, and
  optionally Twilio for phone verification and an AI endpoint for receipt
  scanning.
- **Exact to the cent.** Money is integer cents end to end. Splits are
  recomputed on the server from the raw spec, so a bill always adds up to
  exactly what was paid.
- **Receipts, not typing.** Photograph a receipt and an AI model turns it
  into line items you assign to people, with tax and tip split
  proportionally. The image is never stored.
- **Every currency, never mixed.** Every ISO 4217 currency you can actually
  transact in, with balances kept per currency. Nothing is silently converted.

## What it does

### Expenses

- Groups for anything recurring, and one-off expenses between friends.
- Five ways to split: equally, exact amounts, percentages, shares, or by
  line item.
- Several people paying one bill.
- Itemized bills where each line goes to whoever ordered it, and tax and tip
  follow proportionally.
- Comments on every expense.

### Balances and settling up

- Balances per group, per friend, and overall.
- **Simplify debts**: a group can route its debts as the minimum set of
  payments that clears everyone.
- Record a payment in either direction. Who recorded it is part of the
  ledger, the other party sees it immediately, and either side can remove it.
- Payment handles (Venmo, Zelle, Cash App, PayPal, bank, cash) so settling up
  is one tap away.
- Gentle reminders, delivered in-app and rate-limited.

### People

- Friend requests that need the other side's consent.
- Invite links for a group or for your own profile. Share the link and the
  recipient lands in the right place after signing in.
- Invite someone by phone before they have an account. When they sign up
  and verify that number, their history is waiting for them.
- An activity feed and notifications for everything that touches you.

### Receipt scanning

- Any OpenAI-compatible vision endpoint works. The default is OpenRouter,
  with the model chosen on price and extraction accuracy, and
  zero-data-retention routing requested on every call.
- A mock provider keeps the flow demoable with no key at all.

### Web and mobile

- An installable progressive web app.
- A native iOS and Android app (Expo, React Native) with the same features
  against the same API, universal links for invites, and tokens kept in the
  platform's secure store.

## Built to be trusted with a ledger

- Google sign-in only in production. ID tokens are verified against Google's
  public keys and bound to a one-time nonce.
- Parameterized SQL everywhere, integer cents, server-recomputed splits, and
  idempotent money mutations so a retried request cannot double-post.
- Hardened containers: Docker secrets read as files, read-only root
  filesystem, dropped capabilities, `no-new-privileges`, and nothing
  published but ports 80 and 443.
- Caddy with automatic TLS and HSTS in front; CSP and the other browser
  security headers ship with the app itself.
- CI gates every change: type checks, lint, tests, protobuf breaking-change
  detection, a dependency audit, and a secrets scan over the full history.
  Every third-party action is pinned to a commit SHA.
- Nightly encrypted offsite backups whose upload is verified, not assumed.

## Get started

| I want to… | Read |
| --- | --- |
| Run it on my laptop | [Getting started](docs/getting-started.md) |
| Put it on a server for the people I split with | [Self-hosting](docs/self-hosting.md) |
| Work on the code | [Development](docs/development.md) and [`AGENTS.md`](AGENTS.md) |
| Understand the API | [Backend services](docs/backend/README.md) |

Under the hood: Next.js, ConnectRPC + Protobuf (`buf`), Postgres 17 in plain
SQL, TanStack Query, Expo, Caddy, Docker Compose. One schema-first contract
generates the types for the server, the web client, and the mobile app.

## Contributing and security

Pull requests are welcome. Read [`AGENTS.md`](AGENTS.md) first: it holds the
layering rules and conventions that CI enforces. If you find a security
issue, please report it privately rather than in a public issue.

## License

[GPL-3.0](LICENSE).
