<!-- Historical preimplementation audit, preserved without rewriting its evidence. -->

**Historical snapshot.** The findings below describe commit `8b7b783` before the release implementation. Use [the current release handoff](../mobile-app-store-readiness.md) for completed work, current verification, and remaining publishing steps. The old blockers and instructions are not the current branch status.

<!-- Source audit and iOS publication checklist for HaalKhata, recorded on 2026-10-05. -->

**HaalKhata iOS App Store readiness audit and publishing plan**

Audited October 5, 2026, against commit `8b7b783`. This report covers the Expo mobile source, release configuration, authentication contract, receipt processing, public backend endpoints, dependency checks, and the path through TestFlight to App Review. Findings are a snapshot; rerun the checks after implementation.

**The app is not ready for App Review yet.** Its TypeScript, lint, unit tests, and production iOS JavaScript export pass. The main unfinished work is Apple-compatible login, account deletion, privacy and AI-sharing disclosures, an EAS release configuration, and production-device verification. Expo Doctor and the dependency security gate also fail.

This audit added documentation only. It did not change application behavior, register remote projects, create signing credentials, build a signed IPA, upload a build, or submit an app. Expo and Apple account settings, Google OAuth credentials, provider retention settings, and real-device behavior remain unverified.

**Checks performed**

| Check | Observed result | What it establishes |
| --- | --- | --- |
| Locked dependency installation and `pnpm gen` | Passed | This checkout can install and generate the API package. |
| Mobile typecheck and lint | Passed | Static mobile checks pass. |
| Mobile tests | 25 passed across 5 files | URL validation, encoding, query-cache cleanup, item drafts, and split-form helpers pass. This is not UI or device coverage. |
| Shared typecheck, lint, and tests | Passed; 158 tests across 17 files | Shared money and domain helpers pass their tests. |
| Web typecheck, lint, and tests | Passed; 453 tests passed, 33 skipped | Server/web checks pass; three Postgres integration suites skipped because their database reachability check failed. |
| `pnpm proto:lint` | Passed | Proto lint passes. A breaking-change comparison against a PR base was not run. |
| `expo install --check` | Passed against local SDK dependency map | The CLI warned that this particular check was offline. |
| Official Expo Doctor | 20 of 21 checks passed | Configuration schema fails on three obsolete properties, listed below. |
| `expo config --type introspect` | Passed | Config plugins can produce an iOS plist and entitlements. This does not verify a native archive. |
| Production iOS JavaScript export | Passed; approximately 6.7 MB Hermes bundle | Metro bundles the app after generation, with `EXPO_PUBLIC_API_URL=https://haalkhata.app` supplied for this check. Native compilation and sign-in were not tested. |
| `pnpm audit --prod --audit-level high` | Failed; 2 high advisories | The current repository security gate does not pass. |
| Public `https://haalkhata.app/api/health` | HTTP 200, `{"status":"ok"}` | The public readiness endpoint responded successfully at audit time. It does not prove mobile OAuth, SMS, or AI scanning works. |
| Public `/privacy` and `/support` | Both HTTP 404 | These proposed listing URLs are unavailable. Other externally hosted policies were not inventoried. |
| Public `/.well-known/apple-app-site-association` | HTTP 404 | The configured host does not currently serve its Apple association file at this standard path. |
| App icon inspection | 1024 by 1024; all pixels opaque | The source icon has an alpha channel, but no transparent pixels. Check the generated asset catalog and upload validation before drawing conclusions about the final icon. |
| Local Xcode | Xcode 27.0 installed | The selected command-line tools directory is not Xcode. Using `DEVELOPER_DIR` finds Xcode; Simulator access failed in this audit environment. No device UI was verified. |

**Findings and required work**

| Priority | Finding and evidence | Action and completion criterion |
| --- | --- | --- |
| App Review blocker | Production exposes Google only. `apps/mobile/src/screens/login/constants/googleSignIn.ts` gates password login with `__DEV__`; `proto/auth/v1/auth.proto` has Google authentication and no Apple authentication. No Apple package or entitlement is configured. | Add an equivalent privacy-preserving login. Sign in with Apple is the practical choice for this app. Verify new and returning users in TestFlight. No exception to guideline 4.8 is apparent from the product. |
| App Review blocker | No account deletion appears in the account UI or auth contract. Sign-out and RemovePhone do not delete an account. | Add an easy-to-find deletion flow backed by actual server-side removal of account and associated personal data. Verify token revocation, deletion completion, and subsequent sign-in behavior. |
| App Review blocker | Login/account screens have no privacy-policy or support links. The audited `/privacy` and `/support` URLs return 404. | Publish accessible public pages, link them inside the app, and supply working URLs in App Store Connect. Include operator contact details and accurate data/retention disclosures. |
| App Review blocker | `ReceiptPanel.tsx` offers “Itemize with AI”; `useNewExpense.ts` sends the image without a disclosure naming recipients or a dedicated sharing-consent step. Production Compose routes it through OpenRouter to a Gemini model. | Clearly explain what image/content leaves the device, who receives it, and why. Obtain explicit permission before sharing; permit cancellation and manual expense entry. Ensure provider configuration agrees with the disclosure. |
| Release build gap | No `apps/mobile/eas.json`, Expo project ID, or EAS generation hook exists. `packages/protogen/src/` is gitignored and imported by the mobile app. | Link the EAS project, add a store build profile, pin the repository toolchain, and run `pnpm gen` on the EAS worker before bundling. Demonstrate a successful build from a clean archive. |
| Configuration failure | Expo Doctor rejects `expo.newArchEnabled`, `expo.splash`, and `expo.android.edgeToEdgeEnabled` in `apps/mobile/app.json`. | Remove obsolete switches and migrate splash configuration to the installed SDK's `expo-splash-screen` plugin. Rerun Doctor until all checks pass. |
| Release configuration gap | `buildApiBaseUrl()` deliberately throws when a release has no HTTPS API origin. A missing iOS Google client ID hides the only current production login button. | Set the production EAS environment and add build-time validation for required values. Verify the release talks to the intended server and offers working login. |
| Repository security gate failure | Audit reports `node-forge@1.4.0` and `braces@3.0.3`, both high. Reported paths include Expo CLI certificate tooling and Metro/micromatch tooling. | Trace exposure, check upstream updates or mitigations, and resolve the failing gate. If a temporary exception is necessary, document the exact advisory and scope after assessment; do not disable the whole audit. |
| Feature defect | `app.json` declares `applinks:haalkhata.app`; shared invite URLs use that host. The association file returns 404 and is absent from the repo's public files/routes. | Serve a valid Apple association file using the actual app identifier prefix and bundle ID. Test installed-app invitations, including signed-out acceptance and cold launch. |
| App Review risk | Expenses support shared comments. No reporting/filtering/blocking API or UI was found. RemoveFriend refuses removal while a balance is outstanding, so it is not an abuse-blocking control. | Assess guideline 1.2 for the private shared-content design. Add reporting, a response process, filtering, and blocking where applicable. Blocking must not depend on debt repayment or erase balances. |
| User-visible defect | `useExpensesAPI`, `useGroupsAPI`, and `useActivity` turn missing query data into empty collections without exposing list errors. `AccountScreen` shows a spinner whenever no profile exists, including after a failed read. | Distinguish loading, failure, and empty states. Show a useful retry action. Verify offline and API-outage behavior without implying balances or history disappeared. |
| Permission cleanup | Config introspection adds generic microphone and Face ID purpose strings from plugins. The app picks images only and does not use biometric authentication. | Remove unused permission declarations through supported plugin options; `microphonePermission: false` is available. Inspect the final release plist. Verify that receipt capture asks for camera access only when needed. |
| Submission work | No store metadata, review-access setup, signed release, or device test evidence is present in this checkout. Tablet support is enabled. | Complete the store forms and review access; test iPhone and iPad; prepare matching screenshots. Inspect privacy manifests and encryption declarations in the actual archive. |

Apple's guideline 4.8 requires a qualifying alternative for third-party primary login. Guidelines 5.1.1 and 5.1.2 require an accessible policy and explicit permission for personal-data sharing with third-party AI. Guideline 1.2 describes safeguards for shared user content. The blocker/risk classifications above are this audit's application of those rules to the source. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Deletion must remove the account and associated data except information legally required to be retained. A normal consumer app cannot substitute an email-to-support requirement. Apple authentication also needs token revocation when deleting an account. Design the handling of shared expense records deliberately; expense soft deletion alone does not satisfy personal-data deletion, and shared ledgers are not automatically exempt from deletion obligations. [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

The dependency scan is evidence of affected packages, not proof of exploitation in the native runtime. Both advisory records reported no patched version on the audit date. Recheck before implementing a mitigation. [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Existing strengths worth preserving are HTTPS-only release transport, tokens in SecureStore, session renewal and 401 cleanup, memory-only financial query caches, server-recomputed integer-cent splits, and operation IDs for money mutations. Native tablet layouts and optional phone onboarding are already implemented. No advertising/tracking or in-app-purchase SDK was found in the inspected mobile dependencies. Those observations do not replace a final privacy inventory or runtime verification.

**Publishing steps in order**

1. **Confirm the release identity and accounts.** Use the existing Expo account and Apple Developer membership. Confirm the intended Apple team and the availability/ownership of `com.haalkhata.app`. Decide whether the existing identifier will be retained before generating OAuth clients or signing profiles. Record the Expo owner/project, Apple Team ID, App ID prefix, and later the numeric App Store Connect Apple ID. These are different identifiers. Choose an initial public version; `1.0.0` is a reasonable product choice, while the current `0.1.0` is not itself a rejection cause. Keep iPad support unless deliberately changing the supported product scope.

2. **Implement compliant authentication and deletion together.** Install SDK-compatible `expo-apple-authentication`, add its config plugin, set `ios.usesAppleSignIn: true`, and use its native Apple sign-in button. Add the Apple auth contract, migration, repo functions, usecases, handlers, and client hook/UI following `AGENTS.md`. Verify Apple's identity token signature, issuer, audience, expiry, and nonce on the server. Store the provider's stable subject as identity; do not identify Apple users only by email or automatically merge an existing Google account based on a user-supplied email. Support Hide My Email and first-sign-in-only profile fields, and design an authenticated account-linking path. Implement deletion with reauthentication/confirmation, credential revocation, associated-data cleanup, and session/cache removal. Preserve the repository's web/mobile capability parity with appropriate authentication paths for each platform. The native Expo Apple library supports iOS, so it alone does not provide web/Android access for Apple-created accounts. [Expo AppleAuthentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/).

3. **Finish policy, consent, and shared-content controls.** Publish privacy and support pages, add in-app links on login and account screens, and show the receipt-sharing disclosure before upload. Explain actual OpenRouter/model-provider handling, SMS verification, shared expense visibility, account deletion, retention, and contact details. The Compose ZDR setting expresses a requested policy; verify the actual vendor/account configuration before promising retention behavior. Make report/block tools independent of outstanding balances. Apply pure shared wording/helpers in `packages/shared` where both apps need them.

4. **Repair native configuration and read failures.** Install the SDK-compatible `expo-splash-screen`, move the existing splash design into its plugin, remove Doctor's obsolete properties, and remove unused permission strings. Add read-error/retry states and handle picker/browser failures. Check high-resolution iPhone receipt photos for payload/memory limits; quality compression does not guarantee every image fits the server's 8 MB cap. Test splash appearance in a release build. [Expo SplashScreen configuration](https://docs.expo.dev/versions/latest/sdk/splash-screen/).

5. **Link EAS from the mobile directory.** Run the following interactively and choose the intended existing project if one already exists. These commands are instructions, and were not executed by this audit.

   ```sh
   cd /Users/anirudha/.codex/worktrees/6f30/HaalKhata/apps/mobile
   npx eas-cli@latest login
   npx eas-cli@latest init
   npx eas-cli@latest build:configure --platform ios
   ```

   Check the resulting project association in app config. EAS commands and `eas.json` belong in `apps/mobile` for this monorepo. EAS excludes gitignored files by default, so a local generation step alone cannot supply `packages/protogen/src/` to a remote clean build. [Expo monorepo setup](https://docs.expo.dev/build-reference/build-with-monorepos/), [EAS ignore behavior](https://docs.expo.dev/build-reference/easignore/).

6. **Add reproducible production build settings.** This is a proposed starting configuration for `apps/mobile/eas.json`; replace the numeric app ID placeholder after creating the App Store Connect record. Keep development and store profiles distinct.

   ```json
   {
     "cli": {
       "appVersionSource": "remote"
     },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal",
         "environment": "development",
         "node": "24.21.0",
         "pnpm": "12.9.1"
       },
       "production": {
         "distribution": "store",
         "environment": "production",
         "autoIncrement": true,
         "node": "24.21.0",
         "pnpm": "12.9.1"
       }
     },
     "submit": {
       "production": {
         "ios": {
           "ascAppId": "REPLACE_WITH_NUMERIC_APPLE_ID"
         }
       }
     }
   }
   ```

   Add `"eas-build-post-install": "cd ../.. && pnpm gen"` to the mobile package's scripts, or an equivalent generation step before bundling. Keep generated files gitignored. Confirm root dev dependencies containing Buf/codegen tools are installed on the worker. Build numbers must increase for new uploads; the public version is managed separately. [EAS configuration reference](https://docs.expo.dev/eas/json/), [EAS lifecycle hooks](https://docs.expo.dev/build-reference/npm-hooks/).

   Select a compatible EAS image and inspect its build log. Apple currently requires Xcode 26 or later with the iOS/iPadOS 26 SDK or later; since September 9, 2026, uploaded iOS/iPadOS apps must target iOS 13 or later. Do not confuse the SDK used to compile with the oldest iOS version users can run. Validate the archive's actual deployment target. [Apple current submission requirements](https://developer.apple.com/news/upcoming-requirements/).

7. **Configure production services and public environment values.** In the EAS production environment, set `EXPO_PUBLIC_API_URL=https://haalkhata.app` if that remains the chosen production origin, and the actual `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` for the iOS OAuth client. The URL must be an origin, without `/api/connect`. Add that same client ID to the backend's `GOOGLE_MOBILE_CLIENT_IDS`; if switching Google libraries, align the accepted audience with the token actually issued. Review the Google OAuth consent screen and production user access, plus redirect-scheme behavior on a signed device build. The existing AuthSession provider defaults to `com.haalkhata.app:/oauthredirect`, and that scheme is present in app config; this audit did not establish that the Google console accepts the configured client flow. Expo's current guide presents native Google sign-in libraries as supported integration choices. [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/).

   Public Expo environment values are bundled into the app. Keep Apple signing keys, AI keys, SMS credentials, database credentials, and session secrets out of `EXPO_PUBLIC_*`; store backend secrets through the existing `readSecret()`/`*_FILE` conventions. Configure any Apple server credentials needed for token exchange/revocation. Verify real SMS delivery, real AI scanning with no production mock fallback, readiness, backups, and receipt-provider availability. [EAS environment configuration](https://docs.expo.dev/eas/environment-variables/).

   Serve `https://haalkhata.app/.well-known/apple-app-site-association` as public JSON without an authentication redirect. Use the actual App ID prefix plus `com.haalkhata.app` and restrict routing to the invitation paths. Verify universal links through a freshly installed signed build; a custom-scheme link does not prove HTTPS invitations work.

8. **Create the Apple app record and signing setup.** In Apple Developer, register/confirm the explicit App ID and enable the capabilities actually used, including Sign in with Apple and Associated Domains. In App Store Connect, create the iOS app under the correct team with the matching bundle ID, chosen primary language, and a unique internal SKU. Record its numeric Apple ID in `submit.production.ios.ascAppId`. Accept pending developer agreements and complete pricing/availability setup. Use EAS-managed distribution certificates and provisioning profiles, reviewing the selected team before creation. An App Store Connect API key can be managed by EAS for uploads; keep its private key outside git. [Expo iOS submission setup](https://docs.expo.dev/submit/ios/).

9. **Rerun all release checks from a clean checkout.** Run generation, mobile/shared/web typechecks, lint, tests, proto lint, Expo Doctor, and the production dependency audit. Also run the database integration suites against their intended disposable test databases, never production. Confirm the build archive contains `proto` and the shared packages, and excludes local secrets and unnecessary generated native folders. Inspect the generated plist, entitlements, icons, and privacy manifest aggregation. Native SDK manifests may already supply required API reasons; absence of a hand-written `privacyManifests` field alone is not a proven defect. Review the actual archive report rather than adding arbitrary reasons. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/).

10. **Build the signed production IPA and upload it to TestFlight.** Run from `apps/mobile` after completing the previous steps:

    ```sh
    npx eas-cli@latest build --platform ios --profile production
    npx eas-cli@latest submit --platform ios --profile production
    ```

    Explicitly select the successful production build when submitting. Wait for App Store Connect processing and resolve any upload, capability, privacy-manifest, or encryption issues. Use internal testers first, then external testers when ready. A development client or simulator build cannot serve as the App Store release. Uploading with EAS places a build in App Store Connect; public release still needs App Review. [Expo build profiles](https://docs.expo.dev/build/eas-json/), [Expo iOS submission](https://docs.expo.dev/submit/ios/).

11. **Test the TestFlight build on real devices.** Work through the device checklist below. Test on cellular with Metro and the development server stopped. Include a supported older iPhone, a current iPhone, and an iPad because tablet support is enabled. Fix issues, increment the build number, and repeat affected checks. A successful JavaScript export does not establish that native modules, signing, camera, OAuth, or universal links work.

12. **Complete the store listing and declarations.** Supply the app name, subtitle, description, keywords, suitable category, copyright, support URL, privacy-policy URL, pricing, territories, content rights, and the current age-rating questionnaire. Capture actual app screens with fictional accounts. For a straightforward portrait set, accepted examples are 1320 by 2868 for the large iPhone display and 2064 by 2752 for the 13-inch iPad. Because iPad is supported, include its required assets. Use the current screenshot specifications when exporting and remove screenshot alpha channels. [Apple screenshot requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

    Complete App Privacy using the inventory below, including vendors' practices. Complete export compliance for TLS, SecureStore, and other crypto dependencies; if assessment confirms only exempt encryption, set `ios.config.usesNonExemptEncryption: false`. The absent flag currently means the questionnaire needs attention, not that encryption is prohibited. [Apple export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/), [Apple encryption declaration key](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption).

    Declare DSA trader status in App Store Connect and complete the applicable verification for EU distribution. Paid apps or paid digital features also need the applicable agreements and commercial setup. The inspected app currently records shared expenses/settlements and payment handles; no paid digital feature was found. Reassess purchase rules if monetization is introduced. [Apple trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

13. **Provide review access and submit.** Supply a reachable review contact and reliable access to representative groups, expenses, comments, receipts, and account settings. The existing seeded email/password credentials cannot be used in the production mobile UI. Design usable review access alongside production authentication; if proposing a demo mode instead of an account, follow Apple's approval guidance for that approach. Attach a sample receipt and invitation, and explain AI consent, account deletion, optional phone verification, and that settlement recording does not move funds. Keep backend services available during review. Select the tested build, choose manual release if you want launch control, add it for review, and submit. Respond to reviewer requests, then release after approval. [Apple review preparation](https://developer.apple.com/app-store/review/).

**App Privacy inventory to verify before answering the form**

The following mappings are proposed from the source, not completed App Store declarations. The app stores account-linked records, so “Data Not Collected” would be inaccurate. Confirm purposes, linkage, optionality, actual server logs, and vendor retention. Apple distinguishes stored collection from processing solely to serve a request in real time; ephemeral receipt images need vendor verification before choosing their disclosure treatment. The AI-sharing permission requirement remains relevant independently of that classification. [Apple privacy definitions](https://developer.apple.com/app-store/app-privacy-details/).

| Observed data flow | Proposed disclosure or verification |
| --- | --- |
| Name, Google email, optional verified phone, optional Zelle contact identifier | Contact Info; App Functionality; linked to account. |
| Internal account ID and authentication provider subject | Identifiers / User ID; authentication and App Functionality. |
| Expenses, debts, balances, settlements, merchant/item details | Assess Other Financial Info and Purchase History against the exact stored records. |
| Shared comments, group names, expense descriptions | User Content / Other User Content. |
| Receipt images sent through server to AI providers | Assess Photos or Videos and content extracted from receipts; verify whether any recipient retains images beyond real-time processing. |
| Google avatar URL and remotely fetched avatar image | Verify stored profile data and image-host request behavior. |
| SMS verification through Twilio | Phone-related vendor processing and retention must match the policy. |
| API/security/provider logs, IP addresses, error reports | Inventory actual logging; determine whether diagnostics or other data categories apply. |
| Advertising or cross-app tracking | No such SDK or product flow found in inspected source; confirm vendor practices before selecting “not used for tracking.” |

A public policy, store privacy labels, native privacy manifests, and permission purpose strings serve different purposes. Verify each against the same actual data flows.

**Device checklist for the release candidate**

| Scenario | Expected result |
| --- | --- |
| Fresh install and launch with no Metro | Splash completes; production server is reached; login is available. |
| Apple first login, returning login, Hide My Email, and cancellation | Account identity stays consistent; cancellation is harmless; missing repeat profile fields do not break sign-in. |
| Google login, account switching, browser cancellation, failed token exchange | Correct account opens; failures are visible and recoverable; production audience and nonce validation work. |
| Kill/relaunch, session renewal, revocation, and sign-out | Session persists appropriately; revoked sessions return to login; previous-account data is cleared. |
| Optional onboarding and phone verification | Skipping works; SMS delivery/expiry/errors and recycled-number merge previews behave correctly. |
| Camera allowed/denied; Photos allowed/limited/denied; picker cancellation | Clear recovery; manual entry remains usable; unused microphone permission is not requested. |
| AI sharing cancelled/accepted, slow provider, unavailable provider | No upload without permission; visible failure; no fabricated production fallback. |
| High-resolution/HEIC receipt and multi-item receipt | Image processing is correct; payload/memory limits are handled; user can review and correct extracted amounts. |
| Equal, exact, percentage, share, and itemized splits; multiple payers/currencies | Preview and saved server totals agree; cents remain exact; currencies stay separate. |
| Lost response and retry for expense/settlement writes | Operation ID replay avoids duplicate money mutations. |
| Expense edit/delete, settlement removal, comments, roster/ownership changes | Authorization and balances remain correct; confirmations explain the action. |
| HTTPS invitation from Messages/Mail, cold launch, signed-out login then acceptance | Correct mobile route opens; invitation survives authentication; expired links have a useful error. |
| Abuse report/block with unsettled debt | Safety control works independently of repayment; historical accounting remains consistent. |
| Account deletion with groups, comments, handles, invites, and outstanding history | Deletion follows the disclosed policy; access/credentials are revoked; associated-data handling is verified. |
| Offline launch, API outage, reconnect, pull-to-refresh | Failure is distinguishable from empty history; retry succeeds; the app does not imply debt vanished. |
| iPad rotation/split view, small iPhone, keyboard, large text, VoiceOver | Controls and amounts remain readable and reachable; sheets, dates, and icon buttons are usable. |
| Privacy/support links while signed out; store screenshot scenarios | Links work without an account; screens match the submitted binary and use fictional data. |

**Completion criteria**

- All App Review blockers above are implemented and checked in the release candidate.
- Expo Doctor passes, the clean EAS store build succeeds, and the security gate has an assessed resolution.
- Production authentication, SMS, AI, and invitations are verified on real devices.
- The privacy policy, native declarations, and App Store privacy answers match actual behavior.
- iPhone/iPad testing, reviewer access, screenshots, and metadata are complete.
- The exact tested build is selected for review, and the backend is ready to stay available after launch.
