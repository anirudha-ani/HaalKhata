# Browser, native and iPad parity

Audited on the App Store release branch, October 14, 2026. This records source
coverage and automated verification; it is not a physical-device sign-off.

## Product contract

The browser and Expo clients offer the same account, ledger and social
capabilities. Phone layouts put primary navigation at the bottom. Wider browser
windows use the desktop sidebar; native iPad windows use a compact navigation
rail, wider content columns and centered dialogs. Both retain the ledger palette,
wording, money semantics and action destinations.

Native layout follows **window width**, not the device name. A narrow iPad
multitasking window uses the compact layout. Rotation must preserve the current
screen and form state. The 768-point navigation and 1024-point expanded-content
breakpoints live in `apps/mobile/src/lib/layout/constants/layout.ts`; content
cards must also shrink to fit the space actually available inside the shell.

## Coverage checked

| Capability | Browser (phone and tablet/desktop) | Native (phone and iPad) | Shared rule or evidence |
| --- | --- | --- | --- |
| Google/Apple sign-in, session renewal | Cookie session; Apple HTTPS callback | Bearer session; native Apple on iOS | Auth usecases, session and provider regression tests |
| Signed-out introduction | Landing page beside sign-in | Welcome screen: the same story in a pager, sign-in docked in reach | Shared `welcome/welcomeCopy.ts` ([details](mobile-onboarding.md)) |
| Onboarding, profile, phone verification/merge | Present | Present as guided steps, plus find friends and notifications on first sign-in on each phone | Same AuthService operations ([details](mobile-onboarding.md)) |
| Home, multi-currency balances, people | Present | Present; wrapping columns | Shared money, balance and settlement-position helpers |
| Friends, requests, invitation links | Present | Present | Same SocialService operations; shared invite wording |
| Find friends from contacts | Not in this release; browsers cannot read the address book | Present | `FindContacts`/`SendFriendRequests` are native-only in `test:parity`; matching and wording in `shared/src/contacts/` ([details](contact-discovery.md)) |
| "Let people find me from their contacts" | Present, on by default: onboarding, Account, one-time notice on Friends | Present: same, plus the Find friends screen | Same `SetContactDiscovery`; shared `contacts/discovery.ts` rules |
| Group create/edit, membership, ownership, debt simplification, archive/restore | Present | Present | Same GroupService operations and shared group rules |
| Expenses: create/edit/delete, five split modes, multiple payers | Present | Present | Shared `expense/form/splitForm.ts` and server recomputation |
| Itemized receipt editing, portions, tax/tip, preview | Present | Present | Shared validation, totals, payloads, warnings and allocation |
| Receipt scan and processing consent | Browser file input | Native photo/camera input | Same first-use account permission, withdrawal setting, processing disclosure and receipt API |
| Settlement scope/net settlement and reminders | Present | Present | Same ledger endpoints and shared position/payment helpers |
| Payment-method management and payer details | Present | Present | Shared payment validation, state and formatting |
| History, comments, activity and notifications | Present | Present | Same expense and social operations |
| Push notification settings: switches, phones, test, remove | Present | Present | Same PushService operations; shared categories, wording and phone descriptions |
| Receiving pushes: permission, registration, taps, badge | Not applicable (no Web Push yet) | Present | `RegisterDevice` is native-only; taps use the shared `safeNotificationPath` |
| Reporting/blocking and account deletion | Present | Present | Same safety/deletion endpoints; shared balance-review states |

`pnpm test:parity` currently finds **70 common Connect methods**. It scans actual
client calls in both source trees, including Expo route files, and fails CI on a
one-sided method. There are three explicit native-only exceptions. Native
`LogInWithApple` is a transport difference: browser Apple sign-in uses the
HTTPS callback and `CompleteAppleSignIn`. `RegisterDevice`: a browser has no
Expo push token; Web Push would register through the same RPC and end the
exception. `FindContacts` and `SendFriendRequests` are native-only because Find
friends reads the device address book; the gate still requires both apps to
call `SetContactDiscovery`. This gate checks API entry points; it does not prove that
all parameters, states, gestures or visual layouts are equivalent.

## Problems corrected in this audit

- The native Groups tab received the array index as its badge count. Only real
  pending friend requests now produce a badge.
- Dashboard sections and expense breakdowns used fixed flex bases without
  shrink behavior. They now fit narrow screens and still form wider columns.
- Native login silently accepted an invitation and swallowed acceptance errors.
  Like the browser, it now resumes the public preview for explicit acceptance,
  visible failures and confirmation when a profile link sends a friend request.
  Acceptance invalidates the group/friend/ledger caches on both clients.
- Invite wording and query keys are shared. Native invite storage errors are
  visible, and the invite card is scrollable and width-constrained on iPad.
- Separate expense-form validators had drifted: a positive receipt subtotal on
  native could mask an unpriced line. Both clients now use the same per-line
  validation, currency precision, payload assembly, warnings and previews.
- Native sheets now declare supported landscape orientations and account for
  tablet padding when limiting their height. Footer actions remain outside the
  scrolling body.

## Code ownership

- Keep route files thin. The native primary navigator is in
  `components/shell/PrimaryNavigation/`; the public invite screen and its API
  hook are in `screens/join/components/JoinScreen/`.
- Shared native shell components have component folders. Reusable window
  dimensions/hooks live in `lib/layout/`; sheet-specific constants live under
  `components/ui/Sheet/constants/`.
- Cross-client form rules live in `packages/shared/src/expense/form/`, invitation
  wording in `shared/src/invite/`, and group choices in `shared/src/group/`.
  Renderer-specific input state, image preparation and navigation stay per app.
- Server domains still own their `handler.ts`, `repo/` and `usecase/` layers.
  Crowded auth layers now group Apple, deletion, merge, phone, identity and
  account/session responsibilities into subfolders, with tests colocated.
- Session signing/key rotation is isolated in `auth/usecase/session/session.ts`;
  importing token verification no longer pulls in account/provider workflows.
- Shared server infrastructure is grouped under `common/db/`, `ledger/`,
  `money/`, `secrets/`, `rateLimit/`, `validation/` and `readiness/`. ESLint bans
  UI imports from nested repos and database infrastructure.

## Release verification

Automated checks cover all three workspaces' typecheck, lint and tests, including
real PostgreSQL integration tests, the parity gate, the production web build
(using webpack locally), and an iOS JavaScript bundle export. Native UI tests
exercise real components/hooks with mocked host views; they do not run Apple's
layout engine or native authentication services. A bundle export is not a signed
IPA or TestFlight test.

Before submission, run the same fixture account through the following checks on
mobile Safari, tablet Safari, a physical iPhone and a physical iPad. Keep the
items below unchecked until observed on those surfaces:

- [ ] Home, groups, expense list and friend ledger: same data, currencies,
  filters, visible errors and settlement scope.
- [ ] Create/edit each split type, multiple payers, line-item portions and
  tax/tip; verify stored totals match the preview on every client.
- [ ] Sign-in, sign-out, session renewal, onboarding and a signed-out invite:
  Google and Apple complete and the invite result stays visible.
- [ ] Profile links create pending requests; group links join the named group;
  invalid/revoked links show an actionable failure.
- [ ] Rotate iPad with an expense form or settlement sheet open; resize to a
  narrow multitasking window and back without losing edits or footer actions.
- [ ] Keyboard open, long receipts, large text and VoiceOver: inputs, validation
  messages, close buttons and submit actions remain reachable.
- [ ] Camera/photo permissions, native sharing, payment-app links and browser
  fallbacks work on the signed build.
- [ ] Group archive/restore and membership restrictions match across clients;
  account deletion retains the balance review and explicit confirmation.

For every future feature: update both renderers, put genuinely common pure logic
in the shared package, run the three workspace gates and `pnpm test:parity`, and
exercise the changed flow in phone and tablet windows. The API gate supplements
that review; it does not replace it.

## Latest workflow audit

The resumed native pass fixed expense-column overflow on iPad landscape and
added accessible payer labels. Actual iPhone/iPad login, ledger, editing,
settlement, reporting and selected large-text flows were checked with disposable
local accounts; this does not complete physical-device integration coverage.

See [the October 15 workflow audit](audits/mobile-flows-2026-10-15.md) for the
local API/security checks, fixes and explicit remaining native-device coverage.
