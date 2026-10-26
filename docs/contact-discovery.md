# Find friends from contacts

The mobile app can show which of a person's contacts already use HaalKhata
and send them friend requests, one at a time or all at once. This page covers
how it works, what it stores, and how to run and verify it locally.

## What happens

1. The person opens **Friends → Find friends** (or **Add friend → Find friends
   from contacts**). A card explains what is checked before the operating
   system's prompt appears.
2. The app reads names, phone numbers and emails only. Numbers are normalised
   to E.164 on the device, in the country of the person's own number, else the
   device locale's region. The person's own phone and email are left out.
3. `SocialService.FindContacts` receives phones and emails in calls of up to
   1,000 and returns the identifiers that belong to findable accounts, with a
   minimal profile and the relation (none, requested, incoming, friends).
4. The app joins the replies back to the names saved on the phone. Rows
   offer **Add**, **Accept**, or show **Requested** / **Already friends**.
   Above them, one line quotes the exact notification an Add sends. Each
   **Add** sends one request (`SendFriendRequests` with one id). There is no
   "send to all"; see App Store below.

The web app does not read contacts in this release. Both apps have the
discoverability switch, so a web-only person can still choose to be found.

## Who can be found

Being findable is the default. An account matches unless it has turned off
**Let people find me from their contacts** (`users.contact_discovery =
FALSE`, set by `AuthService.SetContactDiscovery`), and only when:

- the match is its verified phone (`phone_verified_at` set) or its sign-in
  email (Google and Apple both verify it);
- it is a live account (every live row is somebody who signed up with a
  password, Google or Apple — `chk_users_can_sign_in`), not deleted or
  suspended, and not the caller;
- there is no block in either direction.

Accounts that predate the feature start unanswered (NULL), which is findable.
New accounts see the switch, on, during onboarding (the iPhone app shows it on
the Find friends step), and wherever they leave it is saved. Anyone still
unanswered is told once on Friends and on Find friends: **Keep it on** records
a yes and **Turn off** a no. The answer can be changed any time under
**Account → Privacy**.

## What is stored

| Data | Kept? |
| --- | --- |
| Contact names, labels, photos | Never leave the phone |
| Phones and emails sent to FindContacts | Not stored or logged; held only for the request |
| Numbers that match nobody | Create nothing (nor does AddFriend) |
| `contact_lookup_usage` | Per account and UTC day: a count of identifiers checked |
| Friend requests and notifications | Written only when the person taps Add beside someone |

## Limits

| Limit | Value | Where |
| --- | --- | --- |
| Identifiers per FindContacts call | 1,000 | `MAX_CONTACT_IDENTIFIERS_PER_LOOKUP` |
| Identifiers per account per UTC day | 5,000 | `MAX_CONTACT_IDENTIFIERS_PER_DAY`, in Postgres |
| FindContacts calls per minute | 5 | `RPC_RATE_LIMITS.findContacts` |
| Ids per SendFriendRequests call | 10 (the apps send 1) | `MAX_FRIEND_REQUESTS_PER_SEND` |
| SendFriendRequests calls per minute | 20 | `RPC_RATE_LIMITS.sendFriendRequests` |
| Pending requests per recipient | 100 | `MAX_PENDING_FRIEND_REQUESTS` |

Past the daily limit FindContacts fails with `resource_exhausted` and says how
many contacts are left today. The app stops before a chunk the remaining
allowance cannot cover and says how much it checked.

## Run it locally

`expo-contacts` is a native module. The first `./dev.sh --mobile-ios` (or
`--mobile-android`) after pulling this change rebuilds the dev client
automatically, because the native fingerprint changed.

1. Start the stack with `./dev.sh --mobile-ios`. Sign in through Google or
   Apple as described in [local sign-in](local-auth.md). Use real provider
   accounts; fixtures must not bypass sign-in.
2. Create at least three accounts: **A** (the finder), **B** (findable) and
   **C** (not findable). Use the web app at http://127.0.0.1:3000 for B and C.
3. B is findable by default. On C, open **Account → Privacy** and turn off
   **Let people find me from their contacts**. Phone matching also needs B
   to verify a number, which
   needs the Twilio settings in [self-hosting](self-hosting.md#phone-verification-optional).
   Without Twilio, match B by its sign-in email.
4. Put B and C in the simulator's contacts. Write a `.vcf` holding their
   emails (and B's verified number), then add it to the booted simulator:

   ```sh
   xcrun simctl addmedia booted ./friends.vcf
   ```

   On the Android emulator, `adb push friends.vcf /sdcard/Download/` and
   import it from the Contacts app.
5. Sign in as A in the app and open **Friends → Find friends**.

To see the permission prompt again on iOS:
`xcrun simctl privacy booted reset contacts com.haalkhata.app`.

## Verify

- [ ] B appears under **On HaalKhata** with the name saved in contacts, and
      "On HaalKhata as …" when the account name differs. C does not appear.
- [ ] **Add** on B: the row shows **Requested**; B sees the request on Friends
      (web), titled "A's name sent you a friend request".
- [ ] The line above the found people quotes "A's name sent you a friend
      request", and there is no way to ask everyone at once.
- [ ] B turns the switch off: A no longer finds B on the next visit.
- [ ] B blocks A: A no longer finds B.
- [ ] iOS permission: allow all, allow selected (then **Choose more
      contacts**), and deny (then **Open Settings**). Returning from Settings
      updates the screen.
- [ ] Android: allow, deny, and deny with "don't ask again".
- [ ] A contact with no account shows nothing; with no matches at all, the
      empty state offers **Share my invite link**.
- [ ] In Postgres, `SELECT * FROM contact_lookup_usage` holds one count for A,
      and no `users` row was created for any looked-up number.
- [ ] Before release, on a TestFlight build on a physical iPhone, the iOS 18
      limited-access picker works and a 1,000+ contact book completes.

Automated coverage: `pnpm test` (repo and usecase tests on Postgres,
handler buckets, web UI), `pnpm test:shared` (normalisation, matching,
copy), `pnpm test:mobile` (chunked lookup, batched send, permission states)
and `pnpm test:parity`.

## App Store and Play Store

- **App Review 5.1.2(v):** requests go one person at a time, at the
  person's own tap. There is no "Select All" and nobody is pre-selected (the
  guideline forbids both), and the exact notification text shows before any
  Add. Only people already on HaalKhata can be asked; non-users are never
  messaged.
- **App Review 5.1.2(iv):** nothing from the address book is stored.
- **App privacy label:** phones and emails are sent and discarded after the
  request, which Apple does not count as collected. The privacy policy still
  describes it.
- **Google Play contacts policy:** apps targeting Android 17+ that request
  `READ_CONTACTS` must file a declaration. Choose "friend matching/search".
  `WRITE_CONTACTS` is blocked in `app.json`.
