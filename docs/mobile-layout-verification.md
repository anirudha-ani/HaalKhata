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
   above the keyboard. Dismiss test payment/expense forms without saving.

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
