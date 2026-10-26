<!-- Current iOS release handoff for HaalKhata, updated 2026-10-05. -->

# HaalKhata App Store release handoff

The release implementation is on `codex/mobile-app-store-release`, created from
freshly fetched `origin/main` at `4d54949`. Code and local checks are complete;
production credential configuration, signed device builds, TestFlight testing,
and App Review remain release gates. No production deployment, signing upload,
or App Store submission was performed.

The [original audit](audits/mobile-ios-2026-10-05.md) is preserved as historical
evidence. Its unresolved code findings have been implemented here:

| Area | Implemented behavior |
| --- | --- |
| Builds | EAS development/simulator/preview/production profiles, pinned Node/pnpm, remote build numbers, code generation after installation, HTTPS/native Google input validation, deployed-backend preflight. |
| Apple sign-in | Native iOS Apple authentication; verifier-bound web/Android callback; verified issuer/audience/signature/expiry/nonce/email; encrypted provider grants and revocation. |
| Deletion | Account → Delete account, typed confirmation, hard deletion of the original identity, Apple grant revocation, personal-data removal, fresh anonymous shared ledger identity, session invalidation. Fresh payable/receivable totals are shown per currency with Review balances and an explicit Delete anyway option. Failed balance checks offer retry and do not block deletion. |
| Privacy | Public `/privacy` and `/support`; login/account legal links; monitored contact configuration; accurate receipt processor disclosures. |
| Receipt sharing | First-use permission saved per account across both apps, withdrawable in Account settings; current permission checked before provider processing; native JPEG normalization and upload bounds. Manual entry needs no photo sharing. |
| User safety | Private authorized reports, blocks independent of balances, unblock settings, blocked-message/feed filtering, basic text filtering, internal moderator removal/suspension console. |
| Reliability | Retryable load failures; bounded RPC deadlines; caught Google prompt errors; memory-only private query cache preserved. |
| Invite links | Public Apple association and Android asset-link documents derived from actual operator signing identifiers. |
| Dependencies | Exact local mitigations for two unpatched build-tool advisories, passing security regressions, strict audit gate, real Postgres integration tests in CI. |

## 1. Record the account and app identifiers

Use your existing paid Apple Developer membership and Expo account. Confirm the
Apple team owns `com.haalkhata.app`, already used throughout the app and server.
Keep the app identity stable. Record these separately:

- Apple **Team ID**, Sign in with Apple **Key ID**, and **App ID prefix**.
- Apple web **Services ID** grouped with the native App ID.
- Expo account/organization owner and EAS **project UUID**.
- App Store Connect's numeric **Apple ID** after creating its app record.

The configured public version is `1.0.0`. EAS production auto-increments the
remote iOS build number. iPad support remains enabled.

## 2. Configure Sign in with Apple

In Apple Developer, enable **Sign in with Apple** and **Associated Domains** for
`com.haalkhata.app`. Create/group a web Services ID with that primary App ID.
Authorize `haalkhata.app` and register this exact return URL:

```text
https://haalkhata.app/api/auth/apple/callback
```

Create a Sign in with Apple key for this App ID. Download its original `.p8`
file and retain its Key ID. This key is different from an App Store Connect
submission API key. Native iOS uses the bundle ID as audience; web and Android
use the Services ID. If sending email to Apple private relay users, register
and verify the actual sending domains/addresses with Apple.

The account deletion flow revokes Apple credentials before removing the
account. Keep the encryption key stable so existing grants remain revocable.
[Apple's deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

## 3. Configure native Google OAuth

Create an **iOS** OAuth client in the Google project for bundle ID
`com.haalkhata.app`. Use the resulting native client ID for
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; keep the existing web OAuth client separate.
Publish the Google consent screen or explicitly authorize all intended test
users while it remains in testing.

For an Android release later, create its Android client for the package and
actual signing certificate. Set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` for that
platform. The server must accept the actual native IDs in the comma-separated
`GOOGLE_MOBILE_CLIENT_IDS`; do not substitute the web client ID.

## 4. Provision server settings before deploying this branch

The fixed launcher deployed with `v0.4.3` already runs the deploy steps carried
by each release image. Apple settings and secret installation live in
`ops/deploy-release.sh`, so they ship through normal CI deployment; no further
SSH update or manual key upload is needed on an existing launcher-based host.
New hosts follow [the server bootstrap runbook](../ops/README.md).

Set GitHub repository variables:

| Variable | Value |
| --- | --- |
| `APPLE_TEAM_ID` | Your Apple team identifier. |
| `APPLE_KEY_ID` | The Sign in with Apple key identifier. |
| `APPLE_SERVICE_ID` | The grouped Apple web Services ID. |
| `APPLE_APP_ID_PREFIX` | Only needed if your App ID prefix differs from Team ID. |
| `SUPPORT_EMAIL` | A public mailbox you monitor. |
| `GOOGLE_MOBILE_CLIENT_IDS` | The exact iOS native ID, plus Android if used. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Keep the actual web client ID; it is a Docker build argument. |
| `ANDROID_SHA256_CERTIFICATES` | Later: comma-separated colon-delimited SHA-256 app signing fingerprints. |

Add these **GitHub Actions secrets** (separate from repository variables):

| Secret | Value |
| --- | --- |
| `APPLE_PRIVATE_KEY` | Entire original multiline `.p8`, including BEGIN/END lines. |
| `APPLE_TOKEN_ENCRYPTION_KEY` | Generate once with `openssl rand -hex 32`; use the existing server value if already configured. |

The Deploy workflow securely provisions these files with the
permissions/ownership in the ops runbook:

```text
/srv/haalkhata/secrets/apple_private_key
/srv/haalkhata/secrets/apple_token_encryption_key
```

Back up both securely. CI preserves installed files when their GitHub secrets
are unset and refuses accidental encryption-key replacement. Do not generate
a fresh encryption key for later deployments. Publishing a release or manually
running Deploy applies the secrets; saving them alone does not deploy.
They do not belong in Git, client build variables, or the server `.env`.
Existing database, session,
receipt-provider and Twilio secrets remain required for their features.

Production Compose enables Apple readiness checks. Configure all required
values before adopting this release; do not remove those checks to make a
partially configured server appear healthy.

## 5. Finish operating/privacy arrangements

Review the public policy against your actual publisher identity, providers,
and operations. Configure the support mailbox. The current production receipt
routing is OpenRouter with Google/Gemini and requests zero data retention;
confirm the real account/provider terms and routing before launch. Update
`RECEIPT_AI_PROCESSORS` whenever routing changes. The consent fingerprint changes
with the recipient disclosure, model provider, gateway, routing and retention settings. Routine model upgrades with the same recipients do not reset it.

Expire local/offsite archives and old remote object versions within **31 days**
to match the policy. Local pruning is implemented; offsite lifecycle/retention
is your configuration. Keep a private deletion/moderation record to reapply
those actions after a restore.

Review the private moderation queue daily and respond promptly. Run
`./ops/moderate.sh list`, then `remove`, `dismiss`, `suspend`, or `resume` with a
report UUID as documented. Monetary rows stay intact. Automatic filtering is
basic; it does not replace a human reviewing reported content.

## 6. Deploy the backend and verify its public URLs

Merge/push the reviewed release code through the normal deployment workflow
when you are ready. Take/verify a backup first. New migrations apply through
readiness/Connect startup; never edit applied migrations. Then verify:

```sh
curl --fail https://haalkhata.app/api/health
curl --fail https://haalkhata.app/api/mobile-release
curl --fail https://haalkhata.app/.well-known/apple-app-site-association
curl --fail https://haalkhata.app/privacy
curl --fail https://haalkhata.app/support
```

All must succeed without login or redirects. `/api/mobile-release` must report
protocol version `1`, Apple sign-in enabled, and the iOS Google client in its
accepted audience list. The association document must contain your actual
`APP_ID_PREFIX.com.haalkhata.app`. Android also needs `/.well-known/assetlinks.json`.
The EAS production/preview worker refuses an unprepared backend before compiling.

## 7. Link the Expo project and set production build variables

From the repo, install a current EAS CLI and authenticate, then operate inside
`apps/mobile`:

```sh
npm install --global eas-cli
cd apps/mobile
eas login
eas whoami
eas init
```

Select your actual existing project or create the intended one. With dynamic
Expo config, if EAS cannot write the link automatically, put its real UUID in
`app.json` at `expo.extra.eas.projectId` and the owner at `expo.owner`, or use
`EAS_PROJECT_ID`/`EXPO_OWNER` as supported by `app.config.js`. Commit those public
identifiers. Do not use an invented UUID or verification client ID.

Create these EAS **production** environment variables with plaintext visibility;
they are public values in the app bundle and must also be available when the
CLI resolves configuration:

```text
EXPO_PUBLIC_API_URL=https://haalkhata.app
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<actual iOS OAuth client ID>
```

Use the EAS environment UI or `eas env:create`; verify with
`eas env:list --environment production`. Preview has its own environment and
requires matching settings. Never add Apple private keys or server secrets as
`EXPO_PUBLIC_*`. [Expo environment variables](https://docs.expo.dev/eas/environment-variables/).

## 8. Create the App Store Connect record and signing credentials

Create the iOS app record for `com.haalkhata.app`. Choose its name, primary
language, SKU and availability. Accept outstanding Apple agreements. Record
its numeric Apple ID and optionally set `submit.production.ios.ascAppId` in
`apps/mobile/eas.json`.

Run `eas credentials --platform ios` and select production. Let EAS create or
use the intended distribution certificate and App Store provisioning profile.
The profile must include Apple sign-in, Associated Domains and Push
Notifications. Under Push Notifications, let EAS set up a push key (it creates
the APNs `.p8` key and uploads it to Expo; the server never holds it).
Regenerate an older profile after enabling capabilities. The server's
`EXPO_ACCESS_TOKEN` must be in place first (see `ops/README.md`, "Push
notifications"). Configure an App Store Connect
submission API key through EAS; it is separate from the login `.p8` on the
server.

## 9. Build and upload a production binary

From `apps/mobile`:

```sh
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Select the actual successful build. EAS installation generates the protobuf
package and verifies the deployed backend. Inspect the build logs and archive
privacy report. Let App Store Connect process it, then distribute through
TestFlight. Uploading creates a TestFlight build; App Review and public release
are separate App Store Connect actions. [Expo iOS submission](https://docs.expo.dev/submit/ios/).

## 10. Test the actual TestFlight build

See [the browser/native/iPad parity audit](mobile-web-parity.md) for source
coverage, ownership and the cross-platform device test matrix.

Use a physical iPhone and an iPad because tablet support is advertised. Test
with at least two dedicated accounts and representative expenses; local
bundling and simulator compilation do not establish provider/account behavior.

| Flow | Acceptance check |
| --- | --- |
| Apple sign-in | First login, returning login, cancellation, Hide My Email, chosen name preserved. |
| Google sign-in | Correct iOS audience, fresh nonce, returning login, cancellation and browser errors. |
| Sessions | Kill/reopen, normal renewal, sign out everywhere, expired/revoked session, another user after sign-out sees no old data. |
| Welcome | Story pages swipe by hand only; Apple and Google equal size and docked in reach; iPad two columns; Reduce Motion stills the scenes ([checklist](mobile-onboarding.md#verify)). |
| Onboarding | Every step for a new account, only the device steps on a first sign-in, nothing after an update; skip optional profile, phone and payment; SMS success/failure and AutoFill; a number another account holds moves over with both told; one Continue before each iOS prompt and either answer moves on ([checklist](mobile-onboarding.md#verify)). |
| Invitations | Tap a real HTTPS group/profile link from Messages/Mail in cold and warm launches; signed-out flow resumes its pending invite. |
| Money | Every split type, unequal cents/rounding, multiple payers, USD/EUR separately, create/edit/delete, paid/received settlements, duplicate-tap/retry behavior. |
| Notifications | No prompt at launch; onboarding's notifications step (or, for an account signed in before it, the explainer after the first saved expense, payment or group) has one Continue button; Don't Allow leads to "Off in iOS Settings" and Open Settings. Another account's expense, comment, payment, reminder, friend request and group change each arrive and open the right screen cold and warm; the actor gets none. Badge equals the bell and clears in Activity. A switch turned off stops that kind. Sign out, Sign out everywhere and a second account on the same phone stop and clear the first account's pushes. Send a test works and reports a removed phone. See [local push notifications](local-push-notifications.md). |
| Receipt | Camera and library; denial/cancellation; HEIC; explicit processor consent; no upload until consent; provider failure and manual entry; draft reviewed before save. |
| Find friends | Explanation before the prompt; allow all, allow selected then Choose more contacts, deny then Open Settings; accounts that turned off "Let people find me" never appear; requests go one person at a time under a line quoting the notification, with no select-all (5.1.2(v)); a 1,000+ contact book completes ([checklist](contact-discovery.md#verify)). |
| Safety | Report a comment/profile/group/expense; see it in the private queue; block despite debt; no direct requests/reminders or blocked comments; unblock; moderator redaction/suspension. |
| Deletion | Review owed and receivable totals in multiple currencies; Review balances opens the dashboard without deleting; reopening refreshes settled amounts and clears confirmation; failed/offline balance reads never show a false zero and still allow Delete anyway. Cancel confirmation; delete Google and Apple accounts, including private relay; Apple revoke failures leave the account intact and retryable; another account sees anonymous cents/history. |
| Failures | Offline cold launch, flaky API, rate limiting, retry controls, long receipt parsing, no false empty balances. |
| UI/accessibility | iPhone/iPad rotation, small screen, keyboard and large text, sheet scrolling, VoiceOver labels, actual permission strings, external payment-app/browser fallbacks. |

Inspect the **final Release archive** for Apple entitlements, HTTPS restrictions,
opaque icon, aggregated privacy manifests, and removal of Expo dev-launcher
network discovery permissions. Expo's generated build phase strips those from
non-Debug builds. There should be no unused microphone/Face ID permission.

## 11. Complete the store listing and privacy answers

Supply real iPhone/iPad screenshots, description/subtitle/keywords, category,
content rights, current age-rating questionnaire, pricing/availability,
review contact and support URL. Use:

```text
Privacy policy: https://haalkhata.app/privacy
Support:        https://haalkhata.app/support
```

Prepare App Privacy answers from actual data use: name, email/private relay,
optional phone/payment identifiers, account ID, shared financial/expense data,
comments, support/safety submissions, optional receipt image processing, and
push notification delivery (a device push token; notification text passes
through Expo and Apple).
Find friends sends contacts' phone numbers and emails for matching and discards
them after the request, so Apple does not count them as collected; describe the
matching in review notes and keep the privacy policy section current.
Account data is linked to a user. Check Apple categories for the actual fields
and every configured third party; do not claim “no data collected.” No ad or
tracking SDK was found, but verify the final archive and your real providers.
[Apple App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/).

`ITSAppUsesNonExemptEncryption=false` is configured for the app's standard
platform cryptography/HTTPS. Confirm your actual distribution/export answers.
No in-app purchase is implemented; there is no charge in this release.

## 12. Make review access reproducible and submit for review

Provide review instructions that explain Apple/Google login, optional phone,
manual expense creation, receipt sharing consent, reporting/blocking and account
deletion. New sign-ins receive full functionality. Supply dedicated test access
and representative data/resources as required by the reviewer; do not depend on
your personal Google account or a hidden authentication bypass. Ensure any
Google test account can actually finish verification from a new device.

Keep the API, OAuth clients and provider services available throughout review.
Choose the processed build for version `1.0.0`, finish required questions, and
submit in App Store Connect. Choose manual public release for the first launch.
These review expectations follow Apple's completeness, user-content, login and
privacy rules; App Review approval itself remains Apple's decision.
[Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

## 13. Publish and maintain it

After approval, run a final production smoke test and release in App Store
Connect. Monitor support, moderation, API failures and provider health. Future
code releases use a new build number; visible product versions are updated in
`app.json`. Native dependency/capability changes need a new store binary.
EAS Update/OTA delivery is not configured by this change.

## Verified locally

- Web, mobile and shared typecheck/lint gates passed.
- **533 backend tests** passed with disposable PostgreSQL, including account
  erasure, block/report authorization, real moderator SQL and suspension.
- **34 mobile**, **158 shared**, **4 release-config**, and **7 security-patch**
  regression tests passed.
- Protobuf lint and breaking-change comparison against `origin/main` passed.
- Expo native dependency compatibility passed; **Expo Doctor 21/21** passed.
- Production iOS Hermes export passed (approximately 6.8 MB, 3,836 modules).
- Web production build passed with Webpack and includes all public/auth routes.
  Local Turbopack worker-port creation was denied by this execution environment.
- Built-server checks confirmed unauthenticated policy/support/association URLs
  and a sanitized `503` for incomplete production credential configuration.
- iOS prebuild and all **117 CocoaPods** installed; Apple/universal-link
  entitlements and privacy manifest aggregation were verified.
- Unsigned native iOS **Release simulator build passed** with Xcode 27. The
  built app has bundle ID `com.haalkhata.app`, version `1.0.0`, HTTPS-only ATS,
  ten bundled privacy manifests, and no local-network/Bonjour/microphone/Face ID
  permission entries.

The bundle/native verification used non-secret verification settings, not real
OAuth/signing credentials. A signed physical-device IPA, live Apple/Google
login/revocation, production deployment, upload, and App Review are not claimed
by these local results. See [the exact dependency mitigations](build-security-patches.md).
