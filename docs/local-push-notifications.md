# Local push notifications

Every bell notification is also a push. `insertNotifications` writes a
`push_outbox` row on the change's own transaction. A worker inside the web
process sends it through the Expo Push Service and reads delivery receipts
15 minutes later. Run `./dev.sh`: startup applies the
`add-push-notifications` migration, and the worker starts with the server.

## 1. Without a phone (log provider)

`PUSH_PROVIDER=log` is the development default. It prints each push instead
of sending it, so you can check recipients, wording, badge and links.

1. Sign in to the web as two development accounts, A and B, in two browser
   profiles. Make them friends and put them in a group.
2. A phone row is needed for B. Open the mobile app as B with notifications
   allowed, or insert one by hand:
   ```sql
   INSERT INTO push_devices (id, user_id, installation_id, expo_token, platform, token_version)
   SELECT 'dev-local', id, 'install-local', 'ExponentPushToken[localdevelopmenttoken]', 'ios', token_version
     FROM users WHERE email = '<B's email>';
   ```
3. As A, add an expense that includes B. Within a second the server log
   prints `push (log provider)`. The line has B's title (A's display name), body
   (for example, `Added expense · you owe $12.00 · Goa trip · "Dinner"`),
   `badge` (B's unread count), `link`, `threadId` and `collapseId`. A
   `push drain` line follows with the counts.
4. Repeat for a comment, a payment each way, a reminder, a friend request, a
   group add, simplify debts and an ownership change. Each prints once per
   person who sees the feed line. The one who acted never gets a push.
5. Turn a category off in Account → Notifications as B, and repeat. The drain
   line counts it as `skipped`, and the bell still has the row.
6. As B, sign out everywhere (web Account → Sign out). The next drain deletes
   `dev-local`: its `token_version` is now behind.

## 2. Real delivery to an iPhone

Expo Go cannot receive this app's pushes. Use a development build on a
physical iPhone, or TestFlight.

1. In the root `.env`, set `PUSH_PROVIDER=expo`. If enhanced push security is
   on for the Expo project (it is in production), also set `EXPO_ACCESS_TOKEN`
   to an access token from expo.dev. Restart.
2. The app needs the APNs key that EAS manages (`eas credentials -p ios`, see
   `ops/README.md`). Then run `./dev.sh --mobile-ios`. Adding
   `expo-notifications` changed the native fingerprint, so this rebuilds and
   reinstalls the dev client.
3. Sign in as B on the phone. Onboarding's notifications step appears ("Know
   when friends add expenses or pay you", one **Continue** button), then the
   iOS alert; see [onboarding](mobile-onboarding.md). Allow it. Account →
   Notifications shows "Notifications are on for this phone", and the phone
   appears under Your phones as This phone. Someone who was already signed in
   before this release, or who skipped past the iOS alert, gets the same
   explainer once after saving their first expense, payment or group.
4. Tap **Send a test**. A banner arrives within seconds, and its row says
   "Sent". Tapping the banner opens Account.
5. As A on the web, add an expense with B. B's phone shows the banner in the
   foreground and background, and tapping it opens the expense. With the app
   killed, a tap still opens the expense.
6. The app icon badge equals the bell's unread count. Opening Activity clears
   it.
7. Sign out on the phone. The phone leaves Your phones on the web, its banners
   and badge are cleared, and new expenses no longer reach it.
8. Sign back in: the phone registers at once (it appears under Your phones
   again) even if the server had signed it out meanwhile.
9. Turn on Airplane Mode and sign out. An alert says the session ends on the
   server the next time the app is opened online. Turn Airplane Mode off and
   open the app: the next expense from A no longer reaches the phone.
10. Remove This phone from the list on the phone, or remove it from the web.
    The card says notifications are off for this phone, with Turn on, and it
    stays off after the app is killed and reopened. Turn on reconnects it.

Expo's push tool at <https://expo.dev/notifications> sends to a token by hand,
which separates a phone problem from a server problem.

## 3. Tap routing without a server

On the iOS simulator, save a payload and push it:

```json
{
  "Simulator Target Bundle": "com.haalkhata.app",
  "aps": { "alert": { "title": "Ani", "body": "Recorded $25.00 to you · Goa trip" }, "badge": 1 },
  "body": { "notificationId": "local", "link": "/activity", "recipientId": "<signed-in user id>" }
}
```

```sh
xcrun simctl push booted com.haalkhata.app payload.json
```

Tap it with the app running and killed. A different `recipientId` must do
nothing: that is a push left over from another account on the same phone.

## 4. iOS copy and layout regression checks

See the [event-by-event copy](backend/push/push-service.md#ios-notification-content).
Use the real Google or Apple sign-in described in [local auth](local-auth.md)
for provider tests; simulator APNs payloads exercise layout and tap handling
only and are not a substitute for Expo/APNs delivery.

1. On a physical iPhone with previews enabled, repeat the expense, comment,
   group, friendship, reminder and payment flows above. Check a banner, the
   lock screen, and the expanded notification. Use a full display name such
   as Radhika Mehrotra: its title must contain only the person's name; the
   body must begin with the action. Check both ordinary and larger text.
2. Record payments in both directions. Expect `to you` when the actor paid
   the reader, and `from you` when the actor recorded receiving the reader's
   payment. Check a group payment, a one-off payment, and a payment across
   groups. The amount and direction come before the scope.
3. Net balances across two groups and one-off expenses. Check partial and
   full payments. The scope count includes cancelled balances, the remaining
   debtor is clear, and "settled up" is limited to the payment's currency.
   Remove the unit through a reversed offset row: the notification must
   still give the cash payment's original direction and say balances were
   restored.
4. Try long display names, group names and expense descriptions, plus emoji
   and zero-/three-decimal currencies. iOS can shorten long text; it must not
   hide an action merely because the actor has a long name. The bell retains
   the full stored message. Check reminders contain no payment identifier,
   phone-transfer pushes mask the number, and hidden previews disclose no
   person or amount.
5. Onboarding's sample banners follow the same name/action format and allow
   two body lines. The contacts pre-send preview must show both the exact
   friend-request title and body the server sends.

Automated checks: `pnpm gen`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
the corresponding `:mobile` and `:shared` commands, `pnpm test:parity`, and
`pnpm proto:lint`. Give the web test suite local network access so the HTTP
and real-Postgres suites run. Payment notification tests exercise the final
push payload, both directions, distinct scopes, net outcomes and removal.

### Native rendering verified, 2026-10-31

Checked on an isolated iPhone 17e simulator running iOS 27.0, after accepting
the real iOS **Allow** prompt. A temporary native renderer received the
current server-composed title/body payloads through `simctl push`; this checks
system rendering, rather than live Expo/APNs delivery or the app's auth and
tap-routing flows. It makes no financial or app API writes.

The native banner exposed a remaining issue with long bill/group labels:
the reader's amount could still be cut off. Expense copy now puts the action
and money first, followed by the scope and bill label, and omits the repeated
payer name. Removed-share copy also drops its redundant introduction.

Verified payment directions, expense shares, long names and labels, partial
net-payment scopes and remaining debt, comments, payment removal and masked
phone alerts in banners and the lock-screen list. Payment and expense cards
also retained their useful details at `accessibility-extra-extra-large` text
size. The QA device's text size was restored after the check; its granted
permission remains available for later runs.

## What the tests cover

- `apps/web/src/server/push/push.integration.test.ts` runs on real Postgres.
  It checks that the outbox commits with the change, rolls back with it and
  skips blocks, plus delivery with badge and ticket, race-free claims and
  lease expiry, sign-out everywhere, switches, and the new group-wide
  notices.
- Unit tests cover the message builder, the dispatcher's retry and drop rules
  for every Expo error, receipts, the Expo HTTP client, registration
  validation and readiness.
- In the mobile app, tests cover registration only with permission, the
  once-per-phone explainer, tap routing, sign-out order, and the Account card
  on both apps.
- `pnpm test:parity` allows one native-only call, `pushClient.registerDevice`.
