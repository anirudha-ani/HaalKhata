# Test real Google and Apple sign-in locally

Use the same authentication code, provider verification, account linking, and
sessions as production, against your local database. GitHub secrets configure
deployment; they are not automatically available on your laptop.

## One environment file

Run `pnpm setup:env` or `./install-deps.sh --env-only` first. Full dependency
installation runs the same preparation automatically. HaalKhata's known
public IDs are already filled in; existing values and secrets are preserved.
The command prints the secrets and machine-specific settings you still need
to provide. Keep your existing database settings in the repository-root
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
APPLE_PRIVATE_KEY_FILE=/absolute/path/to/AuthKey_YOUR_APPLE_KEY_ID.p8
APPLE_TOKEN_ENCRYPTION_KEY=YOUR_ONCE_GENERATED_64_CHARACTER_HEX_KEY

# Browser and Android Apple sign-in only:
APPLE_SERVICE_ID=com.haalkhata.web
APP_PUBLIC_URL=https://YOUR_DEVELOPMENT_HOST

# Reach this computer's backend from native apps over HTTPS:
EXPO_PUBLIC_API_URL=https://YOUR_DEVELOPMENT_HOST
```

Generate the **local** encryption key once with `openssl rand -hex 32` and
paste the output as `APPLE_TOKEN_ENCRYPTION_KEY`. Keep it unchanged while
using that database: it encrypts Apple refresh tokens needed for account
deletion. `APPLE_TOKEN_ENCRYPTION_KEY_FILE=/absolute/path/to/key-file` also
works. Use the original downloaded `.p8` file; GitHub cannot reveal a stored
secret again. Neither secret gets an `EXPO_PUBLIC_` or `NEXT_PUBLIC_` prefix.

`pnpm dev`, `pnpm dev:mobile`, mobile `ios`/`android` commands, and `dev.sh`
read this file. Expo receives only its `EXPO_PUBLIC_*` entries. Shell values
take precedence, then root `.env`, then any Expo app-local `.env`. Prefer
the root file to avoid stale duplicates. Restart Next and Metro after edits;
rebuild the native app when capabilities/plugins change. EAS cloud builds
continue to use the selected EAS environment.

## Browser sign-in (desktop, mobile Safari, and iPad Safari)

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
   Startup automatically checks URL syntax, reads the private key, actually
   signs a client-secret JWT, and checks refresh-token encryption. Missing
   Apple configuration is reported while other local features remain usable.
4. Open **`https://YOUR_DEVELOPMENT_HOST/login`**, then Continue with Apple.
   Start and finish on that same origin: the private verifier is held in
   that tab's sessionStorage. Starting at localhost and returning elsewhere
   cannot work; the app now explains this before leaving the page.
5. To compare Google on this same URL, add its origin to the web OAuth
   client's Authorized JavaScript origins. Google also supports
   `http://localhost:3000` and `http://127.0.0.1:3000` when registered; Apple
   requires a domain and HTTPS for its return URL.

The Apple web button appears when `APPLE_SERVICE_ID` is configured. Missing
signing credentials produce an error; they never turn into a simulated login.
No additional public Apple client ID or CI deployment is needed.

## Native iPhone/iPad and Android

Native iOS uses bundle ID **`com.haalkhata.app`**, already in app.json, as its
client ID. It needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`, the `.p8` key and the
encryption key on the local backend. It does **not** need `APPLE_SERVICE_ID`
or an Apple browser callback. `EXPO_PUBLIC_API_URL` chooses which backend
receives the native proof; the HTTPS development URL above works on devices
without loosening the app's release transport protections.

```sh
./dev.sh                       # automatic env/auth checks + local database/backend
# In another terminal, connect an iPhone/iPad and build/install the dev client:
pnpm --filter @haalkhata/mobile ios --device
```

Use your Apple team to sign the development build; its provisioning profile
must include Sign in with Apple. If Xcode prompts for signing, choose the
team owning `com.haalkhata.app`. For simulator UI testing,
`./dev.sh --mobile-ios` starts the full stack, but verify Apple login on a
real device too. This option automatically selects the native Apple check,
which does not require browser callback settings. Expo Go uses different app identifiers, so it cannot prove
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
