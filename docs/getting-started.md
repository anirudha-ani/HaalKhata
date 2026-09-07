# Getting started

Run HaalKhata on your own machine in a few minutes. This page covers the
development setup. For a production deployment see [Self-hosting](self-hosting.md).

## One-command setup (fresh box)

```sh
./install-deps.sh   # installs Node, pnpm, Docker, buf, deps + generates protogen
./dev.sh            # starts db + web server at http://127.0.0.1:3000
```

`install-deps.sh` installs everything that is missing and skips what is
already there. `dev.sh` starts the Postgres database and the Next.js dev
server. Use `./dev.sh --clean` for a fresh database and `./dev.sh --down` to
stop everything.

## Manual setup

```sh
pnpm install
pnpm gen                 # buf generate → packages/protogen
docker compose up -d db  # Postgres 17 on localhost:5432 (or use your own)
pnpm dev                 # http://localhost:3000
```

Pending migrations apply automatically on the first API request (and during
the production readiness check), so there is no manual migrate step. A
built-in mock receipt provider keeps the scan flow demoable without any AI
key; see [Receipt AI providers](#receipt-ai-providers-optional) below.

## Configuration

All configuration lives in a single `.env` at the repo root: `docker compose`
reads it directly, and `pnpm dev` loads it via Node's `--env-file-if-exists`.
Copy `.env.example` to `.env` to begin; every variable is documented there.

Using your own Postgres instead of the compose service? Set `DATABASE_URL`
and append `?sslmode=verify-full` (or `&sslmode=verify-full` when the URL
already has parameters). Remote database connections fail closed without
certificate-verified TLS. Real shell variables still win over the file, so
`DATABASE_URL=… pnpm dev` overrides it for a one-off.

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

**Sign-in.** Production accepts Google only, so a release build needs its
own native OAuth clients in the same Google Cloud project as the web one: an
*Android* client for package `com.haalkhata.app` with the signing key's
SHA-1, and an *iOS* client for bundle `com.haalkhata.app`. Put their ids in
`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
when building the app, and list the same ids in the server's
`GOOGLE_MOBILE_CLIENT_IDS` so it accepts them as token audiences. The flow is
the web one's twin: the server issues a one-time nonce, the native OAuth
request carries it, and the ID token Google mints is exchanged for a session.
The bundle id doubles as the OAuth redirect scheme (`app.json` → `scheme`).
The email/phone + password form only appears in development builds, matching
the server's password gate.

## Next steps

- [Self-hosting](self-hosting.md): put it on a server for the people you
  split with.
- [Development](development.md): architecture, migrations, and the quality
  gates that run in CI.
