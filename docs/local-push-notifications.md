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
   prints `push (log provider)`. The line has B's title ("A added …"), body,
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

Expo's push tool at <https://expo.dev/notifications> sends to a token by hand,
which separates a phone problem from a server problem.

## 3. Tap routing without a server

On the iOS simulator, save a payload and push it:

```json
{
  "Simulator Target Bundle": "com.haalkhata.app",
  "aps": { "alert": { "title": "Ani added \"Dinner\"", "body": "Goa trip" }, "badge": 1 },
  "body": { "notificationId": "local", "link": "/activity", "recipientId": "<signed-in user id>" }
}
```

```sh
xcrun simctl push booted com.haalkhata.app payload.json
```

Tap it with the app running and killed. A different `recipientId` must do
nothing: that is a push left over from another account on the same phone.

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
