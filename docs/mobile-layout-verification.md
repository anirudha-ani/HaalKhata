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
- Use available window width, including text scale for content columns. Tablet
  navigation remains a sidebar; narrower windows use bottom navigation.
- Let category/filter strips scroll when they cannot fit. Keep every option
  reachable. Expense category chips scroll on phones and wrap on tablets.
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
