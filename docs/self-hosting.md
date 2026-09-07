# Self-hosting

Everything runs on any box with Docker. No managed platform, no vendor
lock-in. This page describes the production stack in this repo; for the
server-side runbook (bootstrap, secret rotation, backups, restore drill) see
[`ops/README.md`](../ops/README.md).

## Kick the tyres locally

```sh
cp .env.example .env     # set POSTGRES_PASSWORD + SESSION_SECRET
docker compose up -d --build
```

Builds the standalone image and starts it with Postgres 17 (data in the
`db-data` volume, app on `127.0.0.1:3000`). Plaintext `.env`, no TLS: fine
for a local look, not a deployment.

## Production

```sh
# deploy.sh normally writes IMAGE_TAG; for a manual bootstrap, set it to the
# exact 40-character commit image published in GHCR.
docker compose -f docker-compose.prod.yml up -d --wait
```

A separate file rather than an override, because Compose merges list keys by
appending and so an override cannot *remove* the dev file's published ports.
What it adds:

- **Caddy** in front, with automatic Let's Encrypt certificates, HSTS, and
  `header_up X-Forwarded-For {remote_host}` (plus stripping `X-Real-IP`).
  Without that overwrite a client can supply its own `X-Forwarded-For` and
  defeat the auth rate limiter. The production stack enables
  `TRUST_PROXY_HEADERS=true` only alongside that overwrite; direct
  deployments ignore forwarded headers and use the socket peer.
- **Browser security headers ship with the app.** CSP, HSTS, clickjacking,
  MIME-sniffing, referrer, and permissions headers are emitted by
  `next.config.ts` and `middleware.ts`, so they survive a different reverse
  proxy.
- **Docker secrets** for `SESSION_SECRET`, `POSTGRES_PASSWORD`,
  `COMPATIBLE_AI_API_KEY` and `TWILIO_API_KEY_SECRET`. The app reads them
  straight from `/run/secrets/` through `*_FILE` variables (the same
  convention the official Postgres image uses) and builds its own database
  URL, so no secret appears in a compose file, an image layer, `docker
  inspect`, or the process environment. `SESSION_SECRET_PREVIOUS_FILE` keeps
  sessions valid across a planned key rotation.
- **Nothing published but 80/443.** Postgres and the app are reachable only
  over the compose network.
- Read-only application root filesystem, minimal per-service capabilities,
  and `no-new-privileges` across the production stack.

CI builds the image and pushes it to GHCR; the server only pulls. Publishing
a GitHub release is the deliberate act that ships: the deploy workflow builds
the image, then hands the server one commit SHA over an SSH key restricted to
`ops/deploy.sh` by a forced command. The workflow header in
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) lists the
repository variables and secrets it needs.

### Before you point a domain at it

- **Certificate notices need a real recipient.** Set the `ACME_EMAIL`
  repository variable; the deploy pipeline writes it into
  `/srv/haalkhata/.env`, and the production stack refuses to start without
  it. Manual bootstraps without the workflow set it in `.env` directly.
- **Google is the only way in.** `passwordAuthEnabled()` is false when
  `NODE_ENV=production`, so `SignUp`/`LogIn` are rejected.
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is inlined at **build** time; a wrong value
  cannot be fixed by restarting with a corrected environment, only by
  rebuilding.
- **Readiness fails closed.** `/api/health` requires at least 32 decoded bytes
  of `SESSION_SECRET`, waits for migrations, performs a live database query,
  and, since Google is the only way in, refuses when no Google audience is
  configured or the id built into the bundle is not one the server accepts.
  Any of those keeps the container unhealthy and fails
  `docker compose up -d --wait`; the deploy workflow also refuses to build
  without `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- **Backups must leave the box.** `ops/backup.sh` fails (and alerts) when no
  offsite target is configured, and verifies each archive's size on the
  remote after upload. See [`ops/README.md`](../ops/README.md).

### Google sign-in

Create an OAuth client of type "Web application" in the Google Cloud
Console and use the SAME client id for both `GOOGLE_CLIENT_ID` (the audience
the server checks) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the id the browser
renders the button with). Neither is secret, and no client secret belongs in
your configuration: the ID-token flow never calls Google's token endpoint.
Add every origin the button loads on under "Authorized JavaScript origins",
leave the redirect URIs empty, and publish the app so it admits more than the
listed test users. `.env.example` walks through the console setup, and the
[mobile section of Getting started](getting-started.md#mobile-app-expo)
covers the native Android and iOS clients.

### Phone verification (optional)

Verified phone numbers let people invited by phone claim their history when
they sign up. Create a Twilio Verify Service and a restricted API key with
Verify permissions, then set `TWILIO_API_KEY_SID`, `TWILIO_VERIFY_SERVICE_SID`
and `TWILIO_API_KEY_SECRET` (the last one as a secret file in production).
Missing configuration fails closed: no phone number is ever written or merged
without an approved code check, and phone features simply stay unavailable.

### Receipt scanning in production

`docker-compose.prod.yml` pins the provider chain to `compatible` only. In
development the `mock` fallback keeps the scan flow demoable with no key; in
production a fallback that invents plausible line items on someone's real
receipt is worse than a visible failure. The stack points at OpenRouter with
zero-data-retention routing requested on every call; the API key lives in
`secrets/openrouter_api_key`. Also enforce ZDR account-wide in OpenRouter,
which fails closed if a request omits the flag. Receipt images are never
stored by HaalKhata, so this one hop is the entire privacy surface.

## Related

- [`ops/README.md`](../ops/README.md): server bootstrap, secret rotation
  order, nightly encrypted backups, the restore drill.
- [Development](development.md): how the code is laid out, migrations, and
  the quality gates CI runs before anything is deployable.
