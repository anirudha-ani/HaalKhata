# Getting started

Run HaalKhata on your own machine in a few minutes. This page covers the
development setup. For a production deployment see [Self-hosting](self-hosting.md).

## One-command setup (fresh box)

```sh
./install-deps.sh   # installs dependencies, generates protogen, prepares .env
# Local database defaults are automatic; provider secrets are optional.
./dev.sh            # starts db + web server at http://127.0.0.1:3000
```

`install-deps.sh` installs everything that is missing and skips what is
already there. It prefills known public settings in `.env` and lists the
provider secrets to supply yourself. `POSTGRES_PASSWORD` defaults to
`change-me` for the local Compose database; setup fills it when missing or
blank and preserves any existing non-empty password. The local connection
uses it with the prefilled host, port, username and database name.
`dev.sh` prepares configuration, starts Postgres, applies pending migrations,
and then starts the Next.js dev server. It prints **database migrations passed**
before starting web or mobile services. If a migration fails, it prints the
underlying error and stops; fix the error and rerun `./dev.sh`. It checks the
required database password before Compose runs. Missing Apple credentials show an Apple sign-in availability message
on web and mobile; they produce no startup warnings. Use
`./dev.sh --clean` for a fresh database and `./dev.sh --down` to
stop everything.

## Manual setup

```sh
pnpm install
pnpm gen                 # buf generate → packages/protogen
pnpm setup:env           # then fill the listed secrets in .env
docker compose up -d db  # Postgres 17 on localhost:5432 (or use your own)
pnpm dev                 # http://localhost:3000
```

With this manual startup path, pending migrations apply on the first API
request (and during the production readiness check). `./dev.sh` runs the same
checks explicitly before launching the app, so no manual migrate step is needed. A
built-in mock receipt provider keeps the scan flow demoable without any AI
key; see [Receipt AI providers](#receipt-ai-providers-optional) below.

## Configuration

All configuration lives in a single `.env` at the repo root: `docker compose`
reads it directly, and the Next.js and Expo launchers load it before startup.
Expo loads only `EXPO_PUBLIC_*` values; server secrets stay on the backend.
Run `pnpm setup:env` (or `./install-deps.sh --env-only`) to prepare `.env`
without reinstalling dependencies. Known Google web/iOS client IDs, Apple
Team/Key/Services IDs, the support email and local database connection parts
are prefilled from `.env.example`. Apart from the managed Apple key path
below, existing non-empty values, comments and multiline secrets are
preserved; missing or blank public entries are filled
once. You supply private provider credentials yourself. Reruns never generate
or rotate a secret. New `.env` files contain only the fixed local database
default; private provider credentials stay blank. Setup
sets file permissions to owner-only read/write.

All secret fields and their file settings are grouped at the bottom under
**Secrets (fill these in)**, ready to copy and paste. Public IDs and ordinary
configuration stay above. Installation and `./dev.sh` maintain this layout,
preserve existing values (including multiline keys), and keep the last value
when a secret has duplicate assignments.

For Apple, setup creates an ignored root `AppleAuthKey.p8` placeholder and always
sets `APPLE_PRIVATE_KEY_FILE=AppleAuthKey.p8`, relative to the root `.env`.
Replace that file's entire contents with your original Apple `.p8` key, including the BEGIN/END lines;
setup never overwrites existing key contents. Fill `APPLE_TOKEN_ENCRYPTION_KEY`
(or its `_FILE` variant) yourself. Your HTTPS development domain and Android
Google client ID depend on your machine/provider setup and cannot be inferred. The setup
output lists these separately from optional receipt AI and phone credentials.

Using your own Postgres instead of the compose service? Set `DATABASE_URL`
and append `?sslmode=verify-full` (or `&sslmode=verify-full` when the URL
already has parameters). Remote database connections fail closed without
certificate-verified TLS. Real shell variables still win over the file, so
`DATABASE_URL=… pnpm dev` overrides it for a one-off.

For sample data, create a local account, keep `./dev.sh` running, then run
`pnpm db:seed your-account@example.com`. This works on macOS and Linux and
adds fictional friends, groups, expenses, comments, and payments to that
account. Re-running reuses marked demo records; existing data is preserved.
The command refuses production mode and remote databases.

In development, leaving `SESSION_SECRET` empty generates a signing key and
persists it under `data/.secret`. Production requires an explicit value.

### Google sign-in (optional in development)

The email/phone + password form works in development builds, so Google
sign-in is optional locally. To try it, create an OAuth client of type
"Web application" in the Google Cloud Console, add `http://localhost:3000`
under "Authorized JavaScript origins", and paste the same client id into
both `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. No client secret
is involved: the ID-token flow verifies a signed assertion against Google's
public keys and never calls Google's token endpoint. `.env.example` has the
full console walkthrough.

### Apple sign-in (optional in development)

The Apple button is replaced by a “try again later” availability message
until the backend has a usable `.p8` signing key,
Team/Key IDs and encryption key. Browser/Android also need a Services ID and
registered HTTPS development domain; native iOS uses its signed App ID and
must be supported by the device. A placeholder file does not enable Apple.
`./dev.sh` starts without Apple diagnostics. Run `pnpm auth:check` (browser)
or `pnpm auth:check --ios` (native) when you choose to set Apple up.
[Local authentication](local-auth.md) lists every environment
variable, Apple console setting, startup command, and verification step.

### Receipt AI providers (optional)

Set these in `.env`:

- `COMPATIBLE_AI_BASE_URL` / `COMPATIBLE_AI_API_KEY` / `COMPATIBLE_AI_MODEL`:
  the one real provider, any endpoint speaking the OpenAI `/chat/completions`
  wire format. Production uses OpenRouter; a Gemini compatibility endpoint or
  a self-hosted vision box work the same way.
- `COMPATIBLE_AI_ZDR=true`: request zero data retention, restricting routing
  to zero-retention endpoints. Receipt images are never stored by HaalKhata,
  so this hop is the entire privacy surface. Also enforce ZDR account-wide in
  OpenRouter, which fails closed.
- `RECEIPT_AI_PROVIDERS`: failover order; default `compatible,mock`.

The compatible provider activates when a base URL and a model are set. To
demo scanning without a key, leave `COMPATIBLE_AI_MODEL` blank or set
`RECEIPT_AI_PROVIDERS=mock`, and the chain falls through to the mock
provider.

One key, one endpoint: OpenRouter fronts Claude, Gemini and everything else
worth using here, so there is no provider-specific SDK in the codebase.

## Mobile app (Expo)

```sh
./dev.sh --mobile-android   # boot emulator + build/install dev client + Metro + web server
./dev.sh --mobile-ios       # same for iOS simulator
```

The first run builds and installs the dev client (several minutes). Later
runs reuse the emulator and installed app, so Metro and the web server start
instantly. The dev client (not Expo Go) connects to Metro automatically.

The app signs in with bearer tokens against the same `/api/connect`
endpoints. In dev it targets port 3000 on the machine running Metro, so
start the web server with `next dev -H 0.0.0.0` (or set
`EXPO_PUBLIC_API_URL=https://your-server`) when testing from a phone. Release
builds require an explicit HTTPS origin and reject plaintext bearer-token
transport; Android release manifests also disable cleartext traffic.

**Sign-in.** Production supports Google and Apple. Google uses its
own native OAuth clients in the same Google Cloud project as the web one: an
*Android* client for package `com.haalkhata.app` with the signing key's
SHA-1, and an *iOS* client for bundle `com.haalkhata.app`. Put their ids in
`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
when building the app, and list the same ids in the server's
`GOOGLE_MOBILE_CLIENT_IDS` so it accepts them as token audiences. The flow is
the web one's twin: the server issues a one-time nonce, the native OAuth
request carries it, and the ID token Google mints is exchanged for a session.
The bundle id doubles as the OAuth redirect scheme (`app.json` → `scheme`).
Native iOS Apple sign-in requires the Apple capability and server credentials;
web and Android use the grouped Services ID. Follow the
[App Store release handoff](mobile-app-store-readiness.md) for that setup.
The email/phone + password form only appears in development builds, matching
the server's password gate.

## Next steps

- [Self-hosting](self-hosting.md): put it on a server for the people you
  split with.
- [Development](development.md): architecture, migrations, and the quality
  gates that run in CI.
