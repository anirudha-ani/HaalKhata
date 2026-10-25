# Test real Google and Apple sign-in locally

Use the same authentication code, provider verification, account linking, and
sessions as production, against your local database. GitHub secrets configure
deployment; they are not automatically available on your laptop.

Apple is optional for local startup. Leave its key placeholder and encryption
key blank to work with Google or development password login. `./dev.sh`
prepares files quietly; it does not print Apple setup failures. The login
screen checks public availability from the backend and shows Apple only when
that flow is configured. Otherwise, after the availability check finishes,
both apps show “Sign in with Apple is not available at this moment. Please
try again later.” Setup automatically fills a missing or blank
`POSTGRES_PASSWORD` with `change-me` for the local Compose database. Existing
non-empty passwords are preserved; production requires its own real secret.

## One environment file

Run `pnpm setup:env` or `./install-deps.sh --env-only` first. Full dependency
installation runs the same preparation automatically. HaalKhata's known
public IDs are already filled in; existing values and secrets are preserved
except for the managed `APPLE_PRIVATE_KEY_FILE` path described below.
The command prints the secrets and machine-specific settings you still need
to provide. Secret fields live together at the bottom of `.env` under
**Secrets (fill these in)**; setup preserves their values when rearranging
the file. Keep your existing database settings in the repository-root
`.env`; the following shows the configuration for a different account too:

```dotenv
# Existing Google web OAuth client, identical on both sides.
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
# Native client IDs accepted by this local backend (comma separated).
GOOGLE_MOBILE_CLIENT_IDS=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
# Add the Android client to GOOGLE_MOBILE_CLIENT_IDS when testing Android.
# EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com

APPLE_TEAM_ID=YOUR_APPLE_TEAM_ID
APPLE_KEY_ID=YOUR_APPLE_KEY_ID
# Filled automatically by local setup; no manual path calculation needed.
APPLE_PRIVATE_KEY_FILE=AppleAuthKey.p8
APPLE_TOKEN_ENCRYPTION_KEY=YOUR_ONCE_GENERATED_64_CHARACTER_HEX_KEY

# Browser and Android Apple sign-in only:
APPLE_SERVICE_ID=com.haalkhata.web
APP_PUBLIC_URL=https://YOUR_DEVELOPMENT_HOST

# Reach this computer's backend from native apps over HTTPS:
EXPO_PUBLIC_API_URL=https://YOUR_DEVELOPMENT_HOST
```

Setup creates **`AppleAuthKey.p8` in the repository root** with placeholder text.
Replace its **entire contents** with your original downloaded Apple `.p8`
key, including the `-----BEGIN PRIVATE KEY-----` and
`-----END PRIVATE KEY-----` lines. The placeholder cannot sign in. GitHub
cannot reveal a stored secret again, so use your original download.

`./install-deps.sh`, `pnpm setup:env`, and `./dev.sh` always set
`APPLE_PRIVATE_KEY_FILE=AppleAuthKey.p8` in the root `.env`. The loader resolves this
relative to the root `.env`, so it works from `apps/web` and after moving the
checkout without editing the path. Existing absolute paths are also supported;
setup replaces the old checkout-specific value with the portable root filename.
Existing `AppleAuthKey.p8` contents are never overwritten, and both it and `.env`
have owner-only read/write permissions. The key is ignored by Git and Docker.
If you previously used another file or an inline key, paste that key into
`AppleAuthKey.p8` once; setup leaves the old source intact. Production continues
to use its CI-managed secret mount.

Generate the **local** encryption key once with `openssl rand -hex 32` and
paste the output as `APPLE_TOKEN_ENCRYPTION_KEY`. Keep it unchanged while
using that database: it encrypts Apple refresh tokens needed for account
deletion. `APPLE_TOKEN_ENCRYPTION_KEY_FILE=/absolute/path/to/key-file` also
works. Neither secret gets an `EXPO_PUBLIC_` or `NEXT_PUBLIC_` prefix.

`pnpm dev`, `pnpm dev:mobile`, mobile `ios`/`android` commands, and `dev.sh`
read this file. Expo receives only its `EXPO_PUBLIC_*` entries. Shell values
take precedence, then root `.env`, then any Expo app-local `.env`. Prefer
the root file to avoid stale duplicates. Restart Next and Metro after edits;
rebuild the native app when capabilities/plugins change. EAS cloud builds
continue to use the selected EAS environment.

## Browser sign-in (desktop, mobile Safari, and iPad Safari)

The login card groups provider controls above the password form, with privacy
and support links at the bottom. To check locally, run `./dev.sh`, open `/login`
and compare a desktop window with a phone/iPad window (tap **Sign in** to open
the sheet). If Google's script or the local challenge request fails, the card
shows **Retry Google sign-in**. Restore connectivity and retry without reloading;
the retry fetches a fresh nonce and reloads a failed provider script. Receipt
sharing consent stays with the receipt upload flow.

1. Start the local app with `./dev.sh`. Point a stable HTTPS development
   tunnel/domain at `http://127.0.0.1:3000`. Preserve the public `Host` header;
   rewriting it to localhost makes browser CSRF checks reject requests. Use
   a development database because this URL exposes your local app.
2. In Apple Developer → Identifiers → Services IDs → `com.haalkhata.web` →
   Sign in with Apple → Configure, **add** the development hostname under
   Domains and Subdomains and the exact return URL
   `https://YOUR_DEVELOPMENT_HOST/api/auth/apple/callback`. Keep the existing
   production domain/return URL. The Services ID stays grouped with the
   primary `com.haalkhata.app` App ID. Save both configuration screens.
3. Set `APP_PUBLIC_URL` to that HTTPS origin and restart with `./dev.sh`.
   The login screen's availability check validates the callback URL, signs
   a client-secret JWT and checks refresh-token encryption. A missing or
   unusable setting replaces the Apple button with the availability message. Run `pnpm auth:check` if you want a
   detailed configuration diagnostic.
4. Open **`https://YOUR_DEVELOPMENT_HOST/login`**, then Continue with Apple.
   Start and finish on that same origin: the private verifier is held in
   that tab's sessionStorage. Starting at localhost and returning elsewhere
   cannot work; the app now explains this before leaving the page.
5. To compare Google on this same URL, add its origin to the web OAuth
   client's Authorized JavaScript origins. Google also supports
   `http://localhost:3000` and `http://127.0.0.1:3000` when registered; Apple
   requires a domain and HTTPS for its return URL.

The Services ID alone does not enable the button. Missing, unreadable,
placeholder or malformed keys show the availability message instead of a
button, including on mobile. To verify this locally, leave `AppleAuthKey.p8`
as the placeholder, run `./dev.sh`, and open `/login`; the message should
appear after the availability check, while Google/password remain usable. The
availability response contains only booleans. Release readiness and actual
sign-in still enforce all credential checks. No additional public Apple
client ID or CI deployment is needed for local testing.

## The admin page (`/admin`)

The operator's admin page (usage overview and report queue) signs in with
real Google too, through the same web OAuth client, but only addresses on an
allowlist get in. Signing in there never creates an app account.

1. In the root `.env`, put your Google address in `ADMIN_EMAILS` (comma
   separate several). Leave `ADMIN_HOST` and `ADMIN_GOOGLE_CLIENT_ID` blank:
   in development the page is at `/admin` on whatever host you run, and it
   uses `GOOGLE_CLIENT_ID`.
2. Restart the dev server. `.env` is read once at startup, so a running
   server keeps the old allowlist.
3. Open `http://localhost:3000/admin` (an origin the web OAuth client
   already lists) and Continue with Google.

What you should see: with `ADMIN_EMAILS` blank, the card says nobody can
sign in yet instead of offering Google's button. With an address that is
not on the list, Google succeeds and the card then says the account does
not have admin access; the server logs
`admin sign-in refused: address is not on the allowlist` with the size of
the allowlist (never the address). Case does not matter on either side.
Production uses its own hostname and client; see the "Usage page" section
of `ops/README.md`.

## Native iPhone/iPad and Android

Native iOS uses bundle ID **`com.haalkhata.app`**, already in app.json, as its
client ID. It needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`, the `.p8` key and the
encryption key on the local backend. It does **not** need `APPLE_SERVICE_ID`
or an Apple browser callback. `EXPO_PUBLIC_API_URL` chooses which backend
receives the native proof; the HTTPS development URL above works on devices
without loosening the app's release transport protections.

```sh
./dev.sh                       # quiet env preparation + local database/backend
# In another terminal, connect an iPhone/iPad and build/install the dev client:
pnpm --filter @haalkhata/mobile ios --device
```

Use your Apple team to sign the development build; its provisioning profile
must include Sign in with Apple. If Xcode prompts for signing, choose the
team owning `com.haalkhata.app`. For simulator UI testing,
`./dev.sh --mobile-ios` starts the full stack, but verify Apple login on a
real device too. Native availability does not require browser callback
settings. Expo Go uses different app identifiers, so it cannot prove
this app's credential configuration works. Android uses the browser/Services
ID flow above and returns through the app's `haalkhata://login` scheme.

## Verify each change before release

```sh
pnpm auth:check                 # optional browser diagnostic, without starting services
pnpm auth:check --ios           # optional native diagnostic, without starting services
pnpm test:environment           # env/setup checks, secret isolation and startup orchestration
pnpm typecheck && pnpm lint && pnpm test
pnpm typecheck:mobile && pnpm lint:mobile && pnpm test:mobile
```

The preflight does not contact Apple and cannot confirm that a key belongs
to the selected team/App ID. Complete a real sign-in, cancel and retry,
reload/reopen the app, sign out/in, and follow an invite through login.
Check that the account and data are in your local backend. On a disposable
account with settled balances, test deletion and Apple access revocation.
Automated tests use independently signed fixtures for signature/nonce
validation and check callback origins, client proof and session boundaries.

See Apple's [web sign-in configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple)
and Expo's [Apple authentication testing notes](https://docs.expo.dev/versions/latest/sdk/apple-authentication/#development-and-testing).
