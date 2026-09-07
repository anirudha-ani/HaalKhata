<p align="center">
  <img src="apps/web/public/icon.svg" alt="HaalKhata" width="92">
</p>

<h1 align="center">HaalKhata</h1>

<p align="center">
  <strong>Stop being the group accountant.</strong><br>
  Split expenses with roommates, travel buddies, and friends. Scan the receipt, split it by the item, and settle up in one tap.
</p>

<p align="center">
  <a href="https://haalkhata.app"><strong>Try it live</strong></a> &nbsp;·&nbsp;
  <a href="docs/self-hosting.md">Self-host it</a> &nbsp;·&nbsp;
  <a href="docs/getting-started.md">Run it locally</a> &nbsp;·&nbsp;
  <a href="docs/README.md">Docs</a>
</p>

<p align="center">
  <a href="https://github.com/anirudha-ani/HaalKhata/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/anirudha-ani/HaalKhata/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/anirudha-ani/HaalKhata/releases"><img alt="Release" src="https://img.shields.io/github/v/release/anirudha-ani/HaalKhata?label=release&color=b03a25"></a>
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-0f8a5f"></a>
</p>

<p align="center">
  <img src="docs/screenshots/dashboard.webp" alt="The HaalKhata dashboard: what you are owed and what you owe, per currency, with the people and groups behind each number" width="100%">
</p>

You know the moment. The check arrives, someone grabs it, and a week later a group chat is trying to reconstruct who had the calamari. HaalKhata is the calm ledger that replaces that chat. Put an expense in once, everyone sees the same balances, and settling up becomes a tap instead of a negotiation.

It is free, open source, and yours to run. One Docker command on any server and the ledger lives on hardware you control.

## Why people switch

| Own it | Trust it | Actually enjoy it |
| --- | --- | --- |
| Self-hosted on your own box, or use the hosted instance. GPL-3.0. No ads, no trackers, no upsell. | Money is integer cents end to end. The server recomputes every split, so a bill always adds up to exactly what was paid. | Photograph the receipt and the line items appear. Split any way you like with a live preview. Web app and native phone app. |

## Scan the receipt. Split it by the item.

<p align="center">
  <img src="docs/screenshots/receipt-scan.webp" alt="A photographed receipt on the left; on the right, the same receipt as editable line items with a checkbox per person, tax and tip split proportionally, and a total per person" width="100%">
</p>

Snap a photo at the table. HaalKhata reads the merchant, every line, the tax, and the tip, then lays them out as an itemized split. Check off who had what. Tax and tip follow each person's share automatically, and everyone's total updates as you go.

- Every line is editable before you save, and you can add what the scanner missed.
- Works with any vision model behind an OpenAI-compatible endpoint. The default is OpenRouter with zero-data-retention routing requested on every call.
- The photo goes to the model and nowhere else. HaalKhata never stores receipt images.

## Split it any way the night went

| Shares, percentages, exact amounts, or equal | Itemized, with each person's share on every line |
| --- | --- |
| <img src="docs/screenshots/split-shares.webp" alt="The split editor set to Shares, with a different number of shares per person"> | <img src="docs/screenshots/itemized-expense.webp" alt="An itemized expense showing who paid, how it split, and each receipt line with the people on it and your share"> |

Equal, exact amounts, percentages, shares, or by line item. Several people can pay one bill. Leave someone out of a round with one uncheck. Comment on any expense when the numbers need a sentence.

## Balances that clean themselves up

<p align="center">
  <img src="docs/screenshots/group-balances.webp" alt="Group balances with Simplify debts turned on: net positions per person and the minimum set of payments that clears the group" width="100%">
</p>

Every group shows who is up, who is down, and the shortest path to zero. Turn on **Simplify debts** and a tangle of who-owes-whom collapses into the fewest possible payments. Balances are also there per friend and across everything you share.

Every currency stays its own currency. A trip in taka and an apartment in dollars show up as two clean numbers, never one made-up total. Any ISO 4217 currency you can actually transact in is supported.

## Settle up in one tap

<p align="center">
  <img src="docs/screenshots/settle-up.webp" alt="The record-a-payment dialog: who pays whom, which balances it clears, the amount, and Venmo, Zelle, Cash App, PayPal, cash, or bank transfer" width="100%">
</p>

Record a payment with the method you actually used: Venmo, Zelle, Cash App, PayPal, cash, or a bank transfer. Friends can save their handles so paying them is a tap away. Who recorded a payment is part of the ledger, the other person sees it immediately, and either side can remove it. When someone forgets, a gentle in-app reminder does the awkward part for you.

## Friends, groups, and one link to invite anyone

<p align="center">
  <img src="docs/screenshots/friend-ledger.webp" alt="A friend page: the net balance in each currency, where the balance sits by group, and the shared history with a running change column" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/invite-link.webp" alt="An invite landing page: a named friend invited you to a named group, with a Sign in to accept button" width="440">
</p>

Friend requests need a yes from the other side. Share a link to a group or to your own profile and the recipient lands exactly where they should after signing in. Invite someone by phone before they have an account, and when they sign up and verify that number, their history is waiting for them.

## Nothing slips by

<p align="center">
  <img src="docs/screenshots/activity.webp" alt="The activity feed: payments, new expenses, comments, and group changes, filterable by type and month" width="100%">
</p>

Every expense, payment, comment, and group change lands in one feed you can search and filter. Notifications reach you for anything that touches your balance.

## It fits in your pocket

<p align="center">
  <img src="docs/screenshots/mobile.webp" alt="Three phone screens: the dashboard, a trip group, and an itemized expense" width="100%">
</p>

The web app installs to your home screen as a progressive web app. There is also a native iOS and Android app built with Expo, with the same features against the same API, universal links for invites, and sign-in tokens kept in the phone's secure store.

## Built to be trusted with your money

Splitting money with friends only works if nobody has to wonder about the tool. Here is what HaalKhata does about that, all of it in this repository where you can read it.

**Your data stays yours.** The ledger lives in your own Postgres on your own server. There are no analytics or tracking scripts. The only outside services involved are Google for sign-in, and optionally Twilio for phone verification and the AI model for receipt scanning.

**Sign-in is hard to fake.** Production accepts Google sign-in only. ID tokens are verified against Google's public keys and bound to a one-time nonce the server issued. The browser holds the session in an HttpOnly cookie, the phone app in its secure store, and every session can be revoked at once.

**The math cannot drift.** Amounts are integer cents everywhere. The server recomputes every split from the raw spec and rejects anything that does not add up. Every money mutation carries an idempotency key, so a retried request can never double-post. Payments record who entered them, and balances are kept per currency and never converted.

**The receipt scanner forgets.** Images are sent to the model and never written to disk. Zero-data-retention routing is requested on every call, and in production a failed scan is a visible failure, never invented line items.

**The stack is locked down.** Secrets are read from files, never from the environment. Containers run with a read-only root filesystem, every capability dropped, and `no-new-privileges`. Only ports 80 and 443 are exposed. Caddy terminates TLS with automatic certificates and HSTS, and the app ships its own Content Security Policy and browser security headers.

**Every change is checked.** Parameterized SQL throughout, rate limits on sensitive calls, a CSRF guard, and careful proxy-header handling. CI runs type checks, lint, unit and property tests, protobuf breaking-change detection, a dependency audit, and a secrets scan over the full git history. Every third-party action is pinned to a commit.

**Backups leave the box.** Nightly dumps are encrypted with age before they leave the server, shipped offsite, and verified on the remote. A backup that only exists on the same disk counts as a failure and raises an alert.

**It has been through the wringer.** Two full security reviews in 2026 shaped the codebase you see. The fixes landed in the open ([#21](https://github.com/anirudha-ani/HaalKhata/pull/21)). If you find something, please report it privately rather than in a public issue.

## Get running in minutes

```sh
git clone https://github.com/anirudha-ani/HaalKhata.git && cd HaalKhata
./install-deps.sh    # Node, pnpm, Docker, buf, dependencies
./dev.sh             # Postgres + the web app at http://127.0.0.1:3000
```

That is a working local instance with a mock receipt scanner, no API keys required. When you are ready to host it for the people you split with, [Self-hosting](docs/self-hosting.md) walks through the production Docker stack, Google sign-in, and the checklist before you point a domain at it.

| I want to… | Read |
| --- | --- |
| Run it on my laptop | [Getting started](docs/getting-started.md) |
| Put it on a server for my friends | [Self-hosting](docs/self-hosting.md) |
| Work on the code | [Development](docs/development.md) and [`AGENTS.md`](AGENTS.md) |
| Understand the API | [Backend services](docs/backend/README.md) |

## Under the hood

Next.js, ConnectRPC with Protobuf, Postgres 17 in plain SQL, TanStack Query, Expo, Caddy, and Docker Compose. One schema-first contract generates the types for the server, the web client, and the mobile app, so the three can never disagree about what an expense is.

## About the name

A *haal khata* is the fresh ledger shopkeepers in Bengal open each new year, once the old accounts are settled. Clean pages, everyone square. That is the feeling this app is after.

## Contributing and license

Pull requests are welcome. Read [`AGENTS.md`](AGENTS.md) first for the layering rules and conventions that CI enforces. HaalKhata is released under the [GPL-3.0](LICENSE).
