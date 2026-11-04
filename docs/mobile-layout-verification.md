# Mobile layout verification

This checklist covers the Expo app and its mobile-browser counterpart. Use the
same local backend and seeded account so differences in data do not look like
missing features. Never seed a production database for layout testing.

## Run locally

1. Run `./dev.sh --mobile-ios`. The script prepares dependencies, generated API
   types, database migrations and the native dev client before starting Metro
   and the web backend. Use `--mobile-android` for Android.
2. Create a development account with password sign-in. Optionally run
   `pnpm db:seed <local-account-email>` for sample groups, expenses and balances
   in multiple currencies.
3. Open `http://localhost:3000` in a browser at a phone-sized viewport and sign
   in with the same account. Compare Home, Groups, Expenses, Friends, Account,
   the expense form and the payment sheet.
4. Test a narrow phone, iPad portrait, iPad landscape and a narrow tablet window.
   Resize while editing a draft; the input and its value must survive.
5. Increase system text size while the app remains open. On an iOS simulator,
   `xcrun simctl ui <device-udid> content_size accessibility-medium` selects a
   useful large-text case; `content_size large` restores the default.
6. Type consecutive characters with the on-screen keyboard, switch fields and
   rotate the tablet while editing. Confirm the active field remains reachable
   above the keyboard. Use a disposable local ledger to test saves as well:
   create a group with a seeded friend, add a small expense, record its payment
   and verify the balances and Activity. This only records synthetic ledger
   entries; it must not involve an external payment or a real recipient.
7. Enable Reduce Motion in the simulator's Accessibility menu, switch primary
   tabs and detail tabs, open/close sheets, and trigger a validation error.
   Controls should still acknowledge a press, with fades replacing movement.
   Restore text size and motion settings after the pass.

The native app must point to the same development backend as the seed command.
When starting Metro separately, use `EXPO_PUBLIC_API_URL=http://127.0.0.1:3000`
for an iOS simulator. Native provider sign-in requires the client IDs and server
audiences in [local-auth.md](local-auth.md); SMS verification requires the Twilio
configuration linked from [mobile-onboarding.md](mobile-onboarding.md#verify).
For camera/AI and physical-device push checks, follow
[local-receipt-scanning.md](local-receipt-scanning.md) and
[local-push-notifications.md](local-push-notifications.md).

## Layout rules

- Use `@/components/ui/Text` for native text. React Native 0.86's iOS Fabric
  renderer can retain stale line measurements after a live Dynamic Type change
  ([upstream issue](https://github.com/react/react-native/issues/57512)). The
  wrapper recreates only the text host at a new font scale. It does not remount
  a screen or a sibling input; Android keeps the existing host. ESLint enforces
  the import so new screens receive the same behavior.
- Keep controls, headers and sheets in the shared native components. Controls
  need room for scaled labels and at least a 44-point touch target. Only
  decorative avatar initials opt out of text scaling; the adjacent name scales.
- Keep branding on one line with a bounded font size. Preserve the login tagline
  and receipt privacy copy.
- Reserve more width for balance cards as text grows. Keep complete amounts
  visible and stack dense rows rather than reducing a group name to an ellipsis.
- Use available window width, including text scale for content columns. A
  large window keeps navigation in a rail; a phone uses bottom navigation.
- Decide by the window's size, never by device or orientation
  (`src/lib/layout/constants/layout.ts`). A window at least 640 points wide
  and 600 tall is large (`isLargeWindow`): it gets the rail, centred sheets and
  wrapped category chips. A phone held sideways is wide but short, so it keeps
  bottom tabs and bottom sheets: the rail's five items at a large text size and
  a centred sheet above the keyboard both need more height than it has. Tablet
  density (`isSpacious`: inline friend amounts, paired insight cards, the
  two-column welcome, wider margins) needs 640 points for the content itself,
  after the rail and the safe-area insets on both sides, so an iPad mini in
  portrait and iPhone Duo held upright keep a phone's density beside the rail.
  Two content columns (`isExpanded`) start at 1024 points wide.
- Keep every side clear of its own safe-area inset. iPhone Duo's status bar
  runs down the right edge on the outer display and on the inner one held wide,
  so `Screen` pads both sides and the bottom tab bar pads each side by that
  side's inset, never both by the larger one. The rail sits on the leading side
  (the right one when the layout runs right to left) and grows by that side's
  inset.
- Let category/filter strips scroll when they cannot fit. Keep every option
  reachable. Expense category chips scroll on a phone and wrap in a large
  window.
- Horizontal strips must not grow to fill vertical space. Use `flexGrow: 0`
  on their ScrollView, and align chip contents to their natural height.
- Keep a sheet's final action and action error in its `footer`. Its body can
  scroll independently above the keyboard. Respect the current safe-area
  insets, including the notch and landscape side insets.
- Errors owned by the screen orchestrator pass through `Screen.error`;
  descendants may use `useErrorToast`. Calling that hook above Screen's
  provider cannot reach the visible toast. Open sheets show their own errors
  alongside the pinned action.
- Keep native API and money logic shared with the browser. `pnpm test:parity`
  checks Connect method coverage; it does not prove that every UI flow works.

## Verified on 2026-10-15

| Surface | Checks performed |
| --- | --- |
| iPhone simulator, 390-point width | Login branding, consecutive login keystrokes, Home, Friends, activity and settlement layout; normal and larger system text |
| iPad Pro 11-inch simulator | Portrait and landscape navigation; default and larger text; dashboard, Friends and expense form |
| iPad with keyboard open | Consecutive description keystrokes; draft and focus retained through rotation; field visible above keyboard |
| Running iPhone app | Default-to-larger text changes; labels remeasured and unsaved settlement note retained |
| Mobile browser, 390 × 844 | Same-account dashboard and Friends data; expense categories, participants, payer, split modes, currency and notes available |
| Automated | Input identity/focus/draft across edits, rotation and text-scale changes; native text lifecycle/ref forwarding; responsive navigation and sheets; 64 shared Connect methods |

This pass did not execute Android on a device, production Apple/Google OAuth,
real camera/receipt processing, or every ledger mutation. The layout and API
coverage checks are not a replacement for those release smoke tests.

## Interaction review on 2026-10-25

Executed the current Metro bundle on an iPad Pro 13-inch (M5) simulator in
portrait and landscape, and an iPhone 17e simulator. Both used the normal
development sign-in flow and the same disposable, seeded local account.
No production ledger or external payment was changed.

| Surface | Native checks performed in this pass |
| --- | --- |
| Sign-in and onboarding | Password entry, submission and relaunch; profile, optional phone/payment steps, contacts and notifications denial paths on both devices |
| Home and navigation | Multi-currency balances, tablet rail, phone bottom tabs, routes to Activity and Account, primary tab changes |
| Activity and Insights | Reproduced the attached screenshot's stretched month filters on iPad landscape, then verified their natural height; feed/type/month filters and Insights charts |
| Groups and members | Lists and search controls; portrait/landscape creation sheet; member names and action rows; group Expenses/Balances/Activity; add-people and safety-report dialogs (report cancelled) |
| Expense lists and details | Scope filters, group picker, wrapping descriptions/group names/payer summaries; itemized detail, split and comment display |
| Expense editor | All five split editors and participant preview on iPad; description/amount drafts; one-tap iOS date picker, explicit Done/cancel behavior; actual phone create and return to the group |
| Settlement | Group/person entry points and scope wording on iPad; footer above the landscape keyboard; actual phone recording with a note, then settled balances |
| Friends | Four tabs, person ledger, add-friend sheet, invalid-address feedback above the phone keyboard; contacts-denied recovery screen |
| Account and payment methods | Profile save status, invalid-phone inline and pinned feedback, payment-method validation, notification/privacy settings display |
| Accessibility | Live `accessibility-medium` text changes on both devices; phone expense rows stack without squeezed words; large-text friend dialog with keyboard/error/action visible; navigation and sheets with Reduce Motion enabled; settings restored |

The phone save journey created `[QA] Interaction check` with Jess, saved a
USD 12.34 equal split (USD 6.17 each), then recorded USD 6.17 received and
verified "Everyone is settled up". These are disposable local ledger rows.

The fixes also standardize press feedback for chips, segmented controls,
header/icon actions and the floating Add button; fade between primary tabs and
detail views; add outcome haptics to group/expense/settlement saves; and avoid
minting a new operation UUID on each settlement/expense keystroke. Reduced
motion uses fades and a dimmed press response. Simulator checks verify the
interaction states, not physical haptic feel or measured frame rates.

Automated verification: `pnpm typecheck:mobile`, `pnpm lint:mobile`,
`pnpm test:mobile` (180 tests), `pnpm test:parity` (81 shared Connect methods)
and `git diff --check`. Regression coverage includes date confirmation and
cancellation, screen-owned error delivery, and sheet safe-area/footer bounds.
Before publication, the web typecheck and lint also passed, with 1,019 web
tests passing and 215 skipped by the test configuration.

Remaining release checks: Android execution; physical iPhone/iPad gestures,
VoiceOver, keyboard and haptic feel; production Apple/Google provider flows;
real SMS/merge delivery; camera/AI receipt processing; external payment-app
handoffs and push delivery. The phone-verification and merge footer changes
were reviewed structurally, but those provider journeys were not executed in
this pass. Not every destructive or provider-dependent action was submitted.

## iPhone Duo

iPhone Duo folds like a book. Folded, its outer display (466 × 678 points) is a
compact-width phone; open, its inner display (951 × 669 held wide, 669 × 951
upright) is regular width. The app gives the outer display the phone layout and
the inner display the iPad layout. Nothing branches on the device: the window
sizes above decide it, so the layout follows the fold as it opens and closes.
Closed while the inner display is held upright, the outer display comes up
sideways (678 × 466). That is wide enough for the rail but too short for it,
so it keeps bottom tabs and bottom sheets, as any phone held sideways does.

Folding never rebuilds a screen. Moving the tab bar from the bottom to the side
leaves the screens where they are in React Navigation's tree, so a draft and an
open screen carry across the fold.

The status bar is a strip 84 points deep. On the outer display, held either
way, and on the inner display held wide, it runs down the right edge; with the
inner display held upright it runs across the top. Content stays clear of it
wherever it is through the safe-area insets.

### Run it in the simulator

1. Install Xcode 27.1 or later. An app built with an older Xcode runs
   letterboxed on the Duo. EAS's default image for SDK 58 already uses it.
2. Install the Duo's own simulator runtime. The ordinary iOS 27.2 runtime does
   not run it: `xcodebuild -downloadPlatform iOS` installs both, and the Duo's
   appears in `xcrun simctl runtime list` as an `iPhone19-4` runtime.
3. Create the device against that runtime, for example
   `xcrun simctl create "Duo QA" com.apple.CoreSimulator.SimDeviceType.iPhone-Duo com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4`,
   then boot it and install the dev client as for any iPhone
   (`./dev.sh --mobile-ios`, or `expo run:ios --device <udid>`).
4. Open, half-open, close and rotate it with the controls under the device in
   DeviceHub. Neither `simctl` nor XCUITest can change its pose:
   `XCUIDevice.orientation` has no effect, and `simctl io … screenConfig power`
   does not fold it and can take SpringBoard down.
5. Take screenshots of a particular display with
   `xcrun simctl io <udid> screenshot --display=primary-1 inner.png` (inner)
   or `--display=primary outer.png` (outer).

If a reboot leaves the Duo listed as unavailable ("runtime profile not found"),
re-register the runtime from its local copy: delete it with
`xcrun simctl runtime delete <identifier> --keep-asset`, then run
`xcodebuild -downloadPlatform iOS -buildVersion <build>` again, which installs
from the asset already on disk.

When driving the open Duo with XCUITest, tap elements by label. Coordinate
taps land in the wrong place and swipes and drags do not scroll, held either
way. To check what is further down a screen, read the frames in
`app.snapshot()`: it reports every element, including those scrolled out of
view. `typeText` also failed on the Duo, reporting that nothing had keyboard
focus while a field had it; type into the simulator window instead.

### Verified on 2026-11-04

| Pose | Checks performed |
| --- | --- |
| Folded, outer display upright (466 points) | Bottom tabs with all five labels whole beside the right-edge status bar; screens clear of the status bar; sign-in with the development password |
| Open, inner display held wide (951 points) | Rail and one column with tablet density; Home, Groups, Expenses, Friends, a group's Expenses and Balances, its overflow menu, a person's page, the settle dialog as a centred card, the expense form, Account, Activity and Insights; all clear of the status bar |
| Open, inner display upright (669 points) | Rail with phone density beside it, status bar across the top; Friends with each amount under the name, Home, Groups, Expenses, a group's Expenses and Balances, its overflow menu, the settle dialog as a centred card, the expense form, Activity and Insights with the journey tiles two to a row and every other card a full row |
| Half-open, inner display upright | The same window and layout as fully open; Friends, the settle dialog and the expense form respond. Nothing avoids the fold, so a centred dialog crosses it |
| Closed from upright, outer display sideways (678 × 466 points) | Rail beside the right-edge status bar; still on Friends after closing; Home, a group, its overflow menu, the expense form; the settle and add-people dialogs fit the short window with their body scrolling under the pinned action. The on-screen keyboard was not checked: the simulator takes typing from the Mac's keyboard |
| Automated | One table of windows, each with its insets, for navigation and density in every pose: the cover gets bottom tabs held either way, the inner display the rail; tablet density only with 640 points left for the content; a dialog centres only in a window tall as well as wide; the bottom bar pads each side by its own inset and the rail grows by its own side's, right to left too |
