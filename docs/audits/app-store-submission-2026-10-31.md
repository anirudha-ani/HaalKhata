<!-- Evidence and outstanding gates for HaalKhata's first iPhone/iPad App Store submission. -->

# First App Store submission, 2026-10-31

Status: **Submitted for App Review at 4:13 PM PDT on October 31, 2026.** Apple
confirmed **1 Item Submitted**, then **Waiting for Review**, for version 1.0,
build 1.0.0 (6). Manual public
release remains selected. Required screenshots, header and search-result artwork
are uploaded and processed. Header previews were checked on iPhone and iPad in
both orientations; the search preview was checked on iPhone.

[App Review submission](https://appstoreconnect.apple.com/apps/6822393405/distribution/reviewsubmissions/details/6326edba-d60f-4f9d-86bb-d0a122c7abd6)
This record distinguishes source/automated evidence from physical-device testing.

## Release candidate

| Field | Verified value |
| --- | --- |
| App Store Connect Apple ID | `6822393405` |
| Bundle ID | `com.haalkhata.app` |
| Candidate | `1.0.0 (6)`, production/store distribution |
| EAS build | `4f88b415-868b-420c-9133-b3759f9c09bb` |
| Source commit | `cf4f22e25c06203c8ff42b8c46e49d36bd55c01e` (matches this checkout) |
| Apple processing | Validated; TestFlight Testing; uploaded Oct 31 at 1:26 PM PDT |
| SDK / Xcode in uploaded IPA | `iphoneos27.1`, SDK build `24A94232`; Xcode `2710` / `27A9275` |
| Minimum iOS | 16.4 |
| Device families | iPhone and iPad (`UIDeviceFamily` 1 and 2) |
| IPA SHA-256 | `d23f8696a2776109b9d5e22e1d45c0ddad4953929f54f215d499be8dbaa2a0dc` |

The user selected the latest tested build. Exact physical-device/provider flow
results have not been independently reproduced in this audit. TestFlight's
initial build-6 metrics displayed dashes, which do not establish zero crashes
or coverage.

## Completed checks

- Frozen-lockfile dependency installation and `pnpm gen` succeeded.
- Web/mobile/shared typecheck and lint succeeded.
- Web: **1,661 passed, 3 skipped**, 207 passing files, one skipped file.
  An initial sandboxed run could not bind localhost HTTP servers; the rerun
  with localhost access passed. Those environment failures were not code fixes.
- Mobile: **259 passed**. Shared: **917 passed**.
- Proto lint passed. Feature entry-point parity passed: **86 common RPCs**.
  This measures API reachability, not end-to-end parity.
- Release configuration: **4 passed**. Locked Expo native dependency check passed.
- `pnpm audit:production` passed: no unmitigated high/critical advisories under
  the repository's reviewed audit policy.
- Production `/api/health`: HTTP 200, `{"status":"ok"}`.
- Production `/api/mobile-release`: protocol 1, correct bundle ID, Apple enabled,
  expected iOS Google audience accepted.
- `/privacy` and `/support`: public HTTP 200, support mailbox
  `haalkhata@protonmail.com`; live policy effective October 17, 2026.
- Apple association document: correct `QL3M3QZSHQ.com.haalkhata.app` and `/join/*`.
- Actual uploaded IPA inspected: HTTPS-only ATS, no microphone/Face ID/local
  network/Bonjour permission strings, camera/photos/contacts purpose strings,
  portrait and landscape orientations on both device families.
- App Store Connect shows production APNs, Apple sign-in and Associated Domains
  entitlements, `get-task-allow=false`, and the matching team/application ID.
- IPA includes **14 privacy manifests**. None declares tracking or tracking
  domains. Required-reason APIs have declarations. This does **not** establish
  the accuracy of App Privacy labels or replace inventorying server data use.

## Store preparation and approvals

- Approved subtitle: **Shared expenses, made simple**.
- Approved design direction: **warm cream and terracotta matching the app**.
- The user subsequently delegated copy, captions and optional-header selection
  within that direction. Cream-centered header option A was selected.
- The first screenshot set was rejected because it failed to emphasize AI.
  The user approved revised cover A: **Snap the bill. Skip the typing.**
  See `apps/mobile/store/1.0.0/creative-v2/cover-a-snap.png`. Its actual native
  iPhone capture uses USD, Oni, Aditya and Pezanne. Native iPhone and iPad
  captures are complete. The user rejected the repeated free/open-source
  badges on the composed family; these were removed and uploads paused.
  Both v1 and v2 compositions are superseded by the approved v3 Bold product
  story. Six v3 screenshots per required iPhone/iPad slot are uploaded, processed,
  and verified in approved order. The owner explicitly requested completing both
  header and search-result creative assets before final submission.
- Primary audience: United States, especially California. Use natural US English,
  USD and California scenarios. Fictional screenshot names are Oni (the owner),
  Aditya, Pezanne, Radhika, Jess, Rathi and Muskaan. The isolated local API now
  contains a San Francisco dinner and Tahoe weekend fixtures for this purpose.
- The user confirmed **free download and all available countries/regions**.
  Pricing was saved and read back as USD $0.00 across all 175 regions.
  Availability was saved for all 175 countries/regions and future regions.
  Untested Apple Silicon Mac and Apple Vision availability was disabled and
  the Saved confirmation verified for this iPhone/iPad launch.
- The user clarified that the app is completely free to use, with no
  subscriptions, in-app purchases, paid features, advertising or monetization.
  The revised local listing leads with AI receipt scanning and states this
  explicitly. Settlements remain records of payments made outside the app.
  Revised local listing copy was saved and read back in App Store Connect.
- Open-source status verified: the GitHub connector reports
  `anirudha-ani/HaalKhata` as public with GPL-3.0, matching the local LICENSE.
  The user requested open-source positioning and no em dashes in descriptions.
- Primary category set to Finance.
- Build 6 is attached to App Store version 1.0; manual public release was verified
  in the saved version immediately before final submission.
- Selected description, promotional text, keywords, URLs, copyright and subtitle
  were saved and read back against the local metadata file.
- The complete age questionnaire was saved; Apple calculated 4+, with no Kids
  category or age override. Content rights was saved as no additional third-party content after the owner confirmed only the app and user-provided content.
- Approved private review-contact details were saved and verified. The phone
  remains outside source control.
- Factual review notes describe Apple/Google-only authentication, optional
  permissions, AI consent, settlement recording and deletion.
- The user directed reviewers to use Apple/Google sign-in, as in TestFlight.
  Review notes explaining first-sign-in account creation were saved and read
  back in App Store Connect.
- Production EAS submission profile now pins the verified App Store Connect ID.

## Final submission and remaining external steps

- Both header and search-result assets are uploaded and processed. The search
  asset was visually verified in Apple's iPhone Search Results preview without
  clipping. The first processed header clipped its left edge on iPhone. The
  composition was inset, re-rendered, and replaced; the final header was verified
  on iPhone and on iPad in portrait and landscape, with the headline and native
  interface inside the visible area.
  Both final PNGs are rendered under `creative-v3/creative-assets/`, with approved
  copy and native itemized UI. Header: 3840 x 1646. Search: 3840 x 2560. Both are
  opaque PNGs and follow Apple's placement-specific specifications.
- All twelve required screenshots finished processing and were visually verified.
  Add for Review succeeded and created a draft containing version 1.0/build 6.
  The item was temporarily removed from the draft to enable the requested artwork
  edits. After processing and preview checks, Add for Review passed again and
  showed iOS App 1.0 with build 1.0.0 (6). Submit for Review succeeded at 4:13 PM
  PDT; Apple displayed **1 Item Submitted**. The submission details page then
  verified **Waiting for Review** for the same version/build.
- Await Apple's review outcome. Approval and a later manual public release are
  still external steps; submission does not establish approval or availability.
- The Mac native file picker intermittently leaves Open disabled for valid PNGs.
  The owner brought the dialog forward and both creative uploads succeeded.
- Prior TestFlight approval does not guarantee App Review acceptance. Reviewers
  are directed to Apple/Google sign-in, per the owner's instruction. No hidden
  authentication bypass or personal OAuth credentials were provided.
- Physical candidate/provider flow coverage was reported by the owner, not
  independently reproduced here. Retain that distinction in release reporting.
- Keep backend, OAuth/provider accounts, support and moderation operational
  throughout review. Approval and public release are separate actions.

## Screenshot research and design revision

On October 31, the user rejected repeated free/open-source badges and requested
current web research before choosing the first-impression artwork. The pending
native upload dialog was canceled; App Store Connect showed 0 of 10 screenshots.
The badge was removed from both v2 renderers and their regenerated exports.
Free/open-source facts remain in the description and promotional text.

Primary references and direct visual inspection of current US product pages:

- [Apple asset guidance](https://developer.apple.com/app-store/asset-best-practices/):
  show the core experience, make text legible, lead with strong benefits and
  sequence a coherent story. Keep header/search artwork separate from screenshots.
- [Apple product-page guidance](https://developer.apple.com/app-store/product-page/):
  the first one to three screenshots can appear in search; give subsequent images
  one main feature or benefit. Product Page Optimization can measure alternatives.
- [Splitwise](https://apps.apple.com/us/app/splitwise/id458023433):
  short feature headings above full interface screenshots; color changes across
  the sequence. Observed approach is straightforward but visually conventional.
- [tricount](https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256):
  social photographs, large benefit headings and enlarged interface fragments.
  Its free/no-limits/no-ads badge is supporting content on the cover, not repeated
  across the first four frames inspected.
- [Splyt](https://apps.apple.com/us/app/splyt-tab-bill-splitter/id1605675055):
  receipt scanning and splitting are concrete actions; high contrast, short copy,
  a preview and layered app screens emphasize the experience.
- [Copilot Money](https://apps.apple.com/us/app/copilot-track-budget-money/id1447330651):
  full device screens alternate with focused interface details; AI is demonstrated
  by visible results. Accolades are not appropriate to copy for this first release.

These are visual observations, not evidence of conversion uplift or a single
best-performing design. Proposed first-three sequence: AI receipt scanning,
item selection, live collaboration. The approved opening headline is retained.
Three unapproved visual proposals are in
`apps/mobile/store/1.0.0/creative-v2/research-directions/`: A uses bold terracotta
and enlarged native details; B uses clean cream device frames; C uses warm serif
type and a dinner narrative. All interface pixels come from native captures,
and the paper receipt is fictional.

The user selected **A, Bold product story**, then asked whether Zelle/Venmo
settling should join the story. A dedicated fourth image is proposed in place
of the separate tax/tip image, keeping six images in total. The full selected
style was rendered for iPhone and iPad under
`apps/mobile/store/1.0.0/creative-v3/`. The user selected **Settle up. Your way.**
for the fourth image. The six-image sequence is approved for upload. All 18 PNG
exports (medium iPhone, large iPhone, iPad) passed dimension and alpha checks.
The native Brave file picker kept Open disabled in both the version page and
Media Manager, including with All Files selected and a neutral temporary folder.
After the user unlocked the Mac and picker focus recovered, the uploads completed.
App Store Connect shows **6 of 10 screenshots** for medium iPhone and 13-inch iPad.
Both device families have approved 01 through 06 filename order. All twelve
are processed and Add for Review validation passed. The owner then
requested both header and search-result creative assets; those were completed,
processed and previewed before the successful final Submit for Review action.

Settlement claims were checked in `packages/shared/src/payment/appLink.ts`,
`apps/mobile/src/components/modals/PayeeMethodDetails.tsx` and
`apps/mobile/src/components/modals/SettleUpModal.tsx`, then inspected in the
running native app on both simulators. Venmo offers a link with the exact USD
amount, with external confirmation. Zelle exposes copyable registered contact
details for a banking app; it has no universal payment link. Record payment
updates HaalKhata after the external transfer. No payment service was opened,
money transferred or settlement recorded during the screenshot work.

Four fresh native screenshots show fictional Oni paying fictional Radhika
$48.60 for Brunch in Oakland, with separate Venmo/Zelle states on each device.
Fixtures were created only in the isolated local screenshot database using
authenticated application RPCs. Emails use the reserved example.test domain;
the Venmo username is fictional. The captures live under
`creative-v2/native/{iphone,ipad}/settle-{venmo,zelle}.png` and do not establish
end-to-end external payment-provider test coverage.

## App Privacy inventory and decision history

An intermediate unpublished draft contained 13 types, each linked to the user and
used for App Functionality; Name, User ID and Product Interaction also declare
Analytics for the server's usage aggregates. No tracking is declared and no
advertising/tracking SDK was found. The final refinement below restores Other
Diagnostic Data and records the owner's approval and publication of 14 types.
Exact live processor/log retention remains unverified. Optional collection
still normally needs disclosure.

| Apple data type | Observed flow / treatment to confirm |
| --- | --- |
| Name, Email Address, Phone Number | Account identity, Apple relay email, optional verified phone and payment contacts. App Functionality. |
| Other User Contact Info | Optional payment handles/instructions that identify how to reach a payee. |
| Payment Info | User-entered bank account/payment instructions can be stored; external payment execution does not remove the need to disclose details entered inside this app. |
| Other Financial Info | Shared debts, balances and settlements. App Functionality. |
| Purchase History | Merchant/item/expense records describe spending. App Functionality. |
| User ID | Account/provider subjects and authentication. App Functionality. |
| Device ID | Account-linked Expo push token. App Functionality. |
| Contacts | Address-book phone/email matching is ephemeral; names stay on device. Separately assess the **stored friend/group social graph**, which is not ephemeral. |
| Photos or Videos | Persistent Google avatar URLs are the basis of the current draft classification; treating a URL as photo collection is an interpretation. Receipt-photo processing requests zero data retention from the configured provider. Confirm actual vendor behavior. |
| Other User Content | Group/expense names, notes, item descriptions, safety reports. |
| Product Interaction | Account-linked receipt scan tallies, session last-used metadata and usage counts. |
| Analytics purpose | No analytics SDK, but server-side usage aggregates exist. Assess purposes against Apple's definitions; absence of a tracking SDK does not mean there is no analytics use. |

Three types were removed from the original 16-type draft: Emails or Text
Messages (bill comments are currently classified as Other User Content), Customer
Support (support opens an external website/mail link), and Other Diagnostic Data
(no mobile diagnostics uploader was found). The final source review below
corrected that last removal: server diagnostics do need disclosure despite
the absence of a mobile crash SDK.

## Reproduce the technical verification

```sh
pnpm install --frozen-lockfile
pnpm gen
pnpm typecheck && pnpm lint && pnpm test
pnpm typecheck:mobile && pnpm lint:mobile && pnpm test:mobile
pnpm typecheck:shared && pnpm lint:shared && pnpm test:shared
pnpm proto:lint && pnpm test:parity
pnpm --filter @haalkhata/mobile test:release-config
EXPO_OFFLINE=1 pnpm --filter @haalkhata/mobile exec expo install --check
pnpm audit:production
```

The standard React Doctor command currently reports that React Doctor is not
installed in the scanned project instead of producing a diagnostic scan. Do not
count that exit as a successful scan. Native screenshot compilation is a local
debug build against a separate disposable Postgres database and current source;
it does not replace signed-candidate device testing.

## Apple references checked October 31

- [Current SDK requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Screenshot dimensions](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/)
- [Review contact and SSO access fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Final privacy classification refinement

Source review supports retaining the 13 core draft categories. Photos includes
the persistent Google profile-image reference, not a claim that receipt images
are retained by HaalKhata. Contacts includes the stored friendship/group graph,
not a claim that address-book uploads are stored. Payment Info includes optional
user-entered payment/bank details, not monetization or bank credentials.

Other Diagnostic Data should also be disclosed for App Functionality, linked to
the user, because push delivery failures persist notification IDs that can be
joined to recipient accounts (`push/usecase/dispatch/dispatch.usecase.ts`) and
API failures produce structured diagnostics (`api/connect/context.ts`). The
repository configures Docker JSON-log rotation (`ops/daemon.json`). The exact
live retention configuration is unverified; neither the source nor policy
supports claiming there are no retained diagnostics. This corrects the earlier
removal based only on the absence of a mobile crash SDK.

No tracking, advertising, or marketing purpose is supported by the reviewed
flows. Analytics applies to Name, User ID and Product Interaction: the operator
usage page joins existing records to per-person feature counts. This is distinct
from cross-app tracking. Expense comments are treated as Other User Content;
there is no general private-messaging facility. External support website/email
is not an in-app support-data collector. The published final label therefore has
14 data types. The user approved the final publication attestation. App Store
Connect now reports Published by Anirudha Paul and lists all 14 types.

## Account compliance checked

The user confirmed this is a personal, noncommercial project outside business or
professional activity. The DSA non-trader declaration was saved; the Business
Compliance table reports Digital Services Act **Active**, updated October 31,
2026. The content-rights answer was saved and read back after owner confirmation.

Apple initially required the Account Holder to accept the updated Program
License Agreement. The owner reviewed and accepted it. Business now shows the
Free Apps Agreement Active for October 31, 2026 through October 12, 2027; the
blocking update banner is gone. No agreement was accepted by the agent. The
optional Paid Apps Agreement remains unsigned because this app is free and has
no in-app purchases. After the screenshots finished processing, Add for Review
passed without an agreement error.
