# iPhone and iPad welcome and onboarding

The native app opens on a welcome screen that explains HaalKhata, and takes
new people through a short, guided setup. This page covers what each screen
does, the rules it follows, what it stores, and how to run and verify it
locally.

## Welcome screen (signed out)

- The web landing page's story, in the same words
  (`packages/shared/src/welcome/welcomeCopy.ts`). The headline sits above
  three pages, **Snap it**, **Split it** and **Clear it**, each with a small
  animated scene.
- **Continue with Apple** and **Continue with Google** are full width and the
  same height. On a phone they are docked to the bottom edge and never
  scroll away. On iPad they sit in a card beside the story. Either one
  creates the account on first use.
- Development builds add **Use a password (development)**, which opens the
  seeded-account form in a sheet.

Rules this screen follows:

- Pages move only when the person swipes or taps a dot. There are three, and
  nothing auto-advances (WCAG 2.2.2; Apple's Reduce Motion guidance).
- Each scene plays only while its page is on screen. Under Reduce Motion it
  shows its finished picture, still.
- The page dots are one adjustable control for VoiceOver ("Step 2 of 3").
- Apple and Google both require their button to be at least as prominent as
  the other providers'.

## Onboarding steps

| Step | Shown when | What it does |
| --- | --- | --- |
| Profile | Account not onboarded | Name (prefilled) with a live avatar preview, and default currency. Skippable. |
| Phone | Account not onboarded, or a fresh sign-in with no verified number | Number, then a 6-box code that takes iOS one-time-code AutoFill, then the merge confirmation if an invitation holds the number. Carries **Let people find me from their contacts** (on by default), saved however the step ends. Skippable. |
| Payment | Account not onboarded | The Account screen's "Get paid" list. Leaving it marks onboarding complete on the server. |
| Find friends | Contacts not yet refused on this phone | Explains what is read, then **Continue** shows the iOS prompt. Found people get **Add** or **Accept**, one at a time. A refusal moves on. |
| Notifications | iOS has not asked yet | Previews two notifications, then **Continue** shows the iOS prompt. A yes connects the phone. |
| All set | Anything above was shown | Lists what was done, then opens the app where the person was headed. |

Who sees what:

- **Creating an account** shows every step.
- **Signing in on a new phone** with an account set up elsewhere (the web,
  another phone) shows only what this phone has not answered: Find friends,
  Notifications, and Phone if the number is unverified.
- **Updating the app while signed in** shows nothing. The device steps are
  offered only after a sign-in.

The screen the person was headed for (a group from an invitation, say)
opens when the flow ends, if it is one the activity feed may open
(`safeActivityPath`). Otherwise the flow ends on Home.

## Rules that shape the steps

- **One button before a permission prompt.** The Find friends and
  Notifications steps have only **Continue**, which shows the iOS alert;
  the alert is where the person says no. App Review rejects a "Not now" on
  such a screen (Guideline 5.1.1(iv); Apple's privacy guidance says never to
  offer a way out that skips the alert). If the alert itself cannot be
  shown, the step says why and offers a retry and a way past.
- **Optional means optional.** Profile, phone and payment can all be
  skipped (5.1.1(x)).
- **No select-all over contacts.** Requests from Find friends go one person
  at a time (5.1.2(v)). The onboarding step has no "send to all".
- **Haptics for outcomes only.** Success when a code verifies, requests
  send, notifications turn on and setup finishes; error on a wrong code; a
  light tap on Add.

## What is stored on the phone

| Key (AsyncStorage) | Meaning |
| --- | --- |
| `haalkhata.setupDue` | Someone signed in on this phone; written by every sign-in path (`startSession`). |
| `haalkhata.setupDone.<account id>` | This account finished the device steps on this phone. |

These marks are in AsyncStorage rather than the Keychain on purpose: iOS keeps
Keychain items after the app is deleted, but resets its permissions.

## Run it locally

1. Start the stack with `./dev.sh --mobile-ios`. The welcome screen needs
   nothing else. Phone verification needs the Twilio settings in
   [self-hosting](self-hosting.md#phone-verification-optional); without
   them, **Send code** shows the provider error and **Skip for now** moves on.
2. **New account:** on the welcome screen, use Apple or Google (see
   [local sign-in](local-auth.md)) with an account that has never signed in.
   In a development build you can also use **Use a password (development)** →
   **Create account**.
3. **First sign-in on a phone:** sign out, then sign in with an account that
   finished onboarding on the web.
4. To see the iOS prompts again, reset this app's permissions and sign in
   again:

   ```sh
   xcrun simctl privacy booted reset contacts com.haalkhata.app
   xcrun simctl uninstall booted com.haalkhata.app   # notifications reset only on reinstall
   ```

   To replay only the device steps for one account, sign out and back in
   after deleting the app, which also clears its marks.

## Verify

- [ ] Welcome: on an iPhone 15 / 16 / 17 size the headline, a whole step
      and the dots fit above the docked panel. Swiping moves the dots with
      the finger, and the next page's scene does not peek in at rest.
- [ ] Welcome on iPad, landscape and portrait: story and sign-in card side
      by side. A narrow Split View window gets the phone layout.
- [ ] Reduce Motion on: scenes still, steps fade instead of sliding, and the
      sheet does not rise.
- [ ] New account: every step in order. Back works through Profile, Phone
      and Payment, and is gone afterwards. The step indicator fills as you go.
- [ ] Phone: an SMS code arrives and AutoFill on the keyboard fills all six
      boxes and verifies. A wrong code shakes the boxes and says why.
      **Resend code** counts down from 30 seconds. **Use a different number**
      keeps the country.
- [ ] Turning **Let people find me** off on the phone step is saved, and
      Account → Privacy shows it off.
- [ ] Find friends: allow all, allow selected (then **Choose more
      contacts**), and deny (the flow moves straight on). **Add** shows
      Requested, and the person gets the request.
- [ ] Notifications: allow (a test push from Account arrives) and deny (the
      flow moves on).
- [ ] All set lists exactly what happened; **Start using HaalKhata** opens
      Home, or the invited group when the flow began from an invitation.
- [ ] Kill the app during Find friends after Payment: on relaunch only the
      device steps remain.
- [ ] Signed in before this release, then update: no onboarding appears.

Automated coverage: `pnpm test:mobile` covers the step plan (who sees what,
the destination allowlist, progress) and code entry (digits, AutoFill
detection). `pnpm test:shared` covers the welcome copy.
