# Auth Service (`auth.v1.AuthService`)

Authentication, sessions, the caller's profile, phone verification and
transfer, and permanent account erasure.

The Auth Service is essential for:

- **Sign-in:** Google and Apple authenticate production clients; retired
  email/phone + password flows survive for local development and seeded
  accounts.
- **Sessions:** every auth RPC returns a bearer token for mobile clients and
  sets an HttpOnly session cookie for browsers — never both to the same
  client.
- **Profile:** display name, default currency, onboarding state.

Implementation: [handler.ts](../../../apps/web/src/server/auth/handler.ts) →
[auth.usecase.ts](../../../apps/web/src/server/auth/usecase/account/auth.usecase.ts),
[setPhone.usecase.ts](../../../apps/web/src/server/auth/usecase/phone/setPhone.usecase.ts),
[phoneVerification.ts](../../../apps/web/src/server/auth/usecase/phone/phoneVerification.ts).
Session mechanics (token format, sliding renewal, revocation, cookie rules)
are documented once in
[conventions.md § Authentication & Sessions](../common/conventions.md#authentication--sessions).

---

## The Identity Model

An account (`users` row) can hold email, phone (E.164), Google `sub`, and
Apple `sub`. **Nobody exists here before signing up:** every live row has a
password hash or a linked Google or Apple account, and the database refuses
any other (`chk_users_can_sign_in`). The only rows without a credential are
the anonymous stand-ins account deletion leaves:

| State | password_hash | google_sub | apple_sub | Meaning |
| --- | --- | --- | --- | --- |
| Password account | set | optional | optional | Dev/seeded account |
| Provider account | optional | set or null | set or null | Signed in with at least one verified provider |
| Deleted member | null | null | null | Anonymous identity with `deleted_at`; preserves shared cents, cannot authenticate, be added to anything new, or be claimed |

**Nothing is claimed or merged.** Adding a friend or a group member by an
email or phone that belongs to nobody creates nothing (see
[social](../social/social-service.md) and
[group](../group/group-service.md)); the person signs up through a link as
themselves. So there is no row for a sign-up, a verified phone or a link to
take over:

- **Email:** `SignUp` (dev) refuses an email or phone any account already
  holds, whatever its credential. Google sign-in with a matching *verified*
  email links Google to that existing account, which keeps its own name;
  Apple does the same.
- **Phone:** `SetPhone` + SMS verification writes the number, or moves it off
  the account that holds it (§34). There is no merge step.

Until migration `1793040072450_retire-unregistered-people`, an email or
phone typed into an add form created a placeholder row that a later sign-up,
a verified phone or a one-person invite link could claim. That migration
retired every placeholder and merge tombstone: a row that money or
authorship pointed at became a Deleted member, every other one was deleted,
and `users.merged_into` was dropped.

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| SignUp, LogIn, BeginGoogleSignIn, LogInWithGoogle, BeginAppleSignIn, LogInWithApple, CompleteAppleSignIn | 10/min per client IP |
| DeleteAccount | Same 10/min per client IP authentication bucket, plus an authenticated session and explicit confirmation |
| SetPhone with empty code (the SMS send) | 3/min per account, plus 3/hour + 8/day per destination number (across all accounts) and 20/hour per client IP — the ceilings are **durable** (Postgres `phone_send_events`), surviving restarts and replicas |
| SetPhone with a code (the check) | 5/min per account, and at most **5 checks per verification** (server-side attempt budget, the same as Twilio's; a resend does not renew it) |
| RemovePhone | 5/min per account (`PHONE_REMOVAL_RATE_LIMIT`) |

The per-destination limits exist because a per-account limit alone lets
anyone with several accounts point all of them at one victim number (SMS
pumping / harassment). Destination keys are a purpose-bound HMAC of the
number, never the raw number. The buckets are split so a fumbled code
cannot lock the user out of removing a number.

---

## Overview of Endpoints

1. [SignUp](#1-signup) *(dev only)*
2. [LogIn](#2-login) *(dev only)*
3. [BeginGoogleSignIn](#3-begingooglesignin)
4. [LogInWithGoogle](#4-loginwithgoogle)
5. [LogOut](#5-logout)
6. [GetMe](#6-getme)
7. [UpdateProfile](#7-updateprofile)
8. [SetPhone](#8-setphone)
9. [ConfirmPhoneMerge](#9-confirmphonemerge) *(retired)*
10. [RemovePhone](#10-removephone)
11. [CompleteOnboarding](#11-completeonboarding)
12. [Apple sign-in](#12-apple-sign-in)
13. [DeleteAccount](#13-deleteaccount)
14. [SetContactDiscovery](#14-setcontactdiscovery)

---

### 1. SignUp

**Method:** `SignUp`
**Route:** `POST /api/connect/auth.v1.AuthService/SignUp`

#### Notes

- **Production-disabled.** `PermissionDenied` ("sign in with Google or Apple to
  continue") outside development — enforced in the usecase, not by hiding the
  form, because the RPC stays mounted and reachable by anyone willing to POST
  at it.
- **Identifier:** exactly one of `email` / `phone`. Email is trimmed and
  lowercased; phone is normalized to E.164 (US national formats accepted —
  `DEFAULT_PHONE_REGION`). The error names whichever shape was actually tried.
- **Name:** required, trimmed, ≤ the shared `MAX_USER_NAME_LENGTH`.
- **Password:** 8–1024 chars. The upper bound is a CPU-DoS guard — scrypt has
  no input cap of its own. Hashing is scrypt (random 16-byte salt, 64-byte
  key) on the libuv thread pool; verification is constant-time.
- **No takeover:** an identifier any account already holds refuses with
  `AlreadyExists`, whatever its credential — a passwordless Google account
  must not be reachable through this form by anyone who knows the address.
- **Session delivery:** cookie for browsers (`token` comes back empty),
  bearer token in the body for the mobile transport — see conventions.

#### Request

**SignUpRequest:**

| Field | Type | Description |
| --- | --- | --- |
| email | string | Exactly one of email/phone must be set. |
| phone | string | E.164 or US national format. |
| name | string | Display name (required). |
| password | string | Plaintext; 8–1024 chars. |

**Sample Request (JSON):**

```json
{ "email": "rifat@example.com", "phone": "", "name": "Rifat", "password": "correct horse battery" }
```

#### Response

**AuthResponse** — the created user as the caller's private
projection, plus `token` (bearer clients only).

```json
{
  "user": {
    "id": "1c9e...", "email": "rifat@example.com", "name": "Rifat",
    "avatarColor": "#1d4ed8", "defaultCurrency": "USD", "registered": true,
    "phone": "", "paymentHandles": [], "onboarded": false, "avatarUrl": ""
  },
  "token": ""
}
```

---

### 2. LogIn

**Method:** `LogIn`
**Route:** `POST /api/connect/auth.v1.AuthService/LogIn`

#### Notes

- **Production-disabled**, like SignUp.
- Looks the account up by whichever of `email`/`phone` is non-empty.
- **One generic failure.** Unknown identifier, an account with no password,
  a wrong password, and an oversized password (rejected *before* scrypt runs — DoS
  guard) all return `Unauthenticated` "invalid email/phone or password".
- Password check is constant-time against the stored `salt:hash`.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| email | string | Exactly one of email/phone. |
| phone | string | |
| password | string | |

#### Response

**AuthResponse** (same shape and delivery rules as SignUp).

---

### 3. BeginGoogleSignIn

**Method:** `BeginGoogleSignIn`
**Route:** `POST /api/connect/auth.v1.AuthService/BeginGoogleSignIn`

#### Notes

- Issues a **server-side nonce** for one Google sign-in attempt: 32 random
  bytes, base64url. The client passes it to Google Identity Services, which
  copies it into the ID token; `LogInWithGoogle` then accepts it **exactly
  once**.
- Only the SHA-256 **hash** of the nonce is stored (with a 5-minute expiry),
  so a database read can never reveal a still-usable challenge.
- Fails `InvalidArgument` when `GOOGLE_CLIENT_ID` is unset — a misconfigured
  deploy should fail loudly on the first sign-in, not verify tokens against
  an empty audience.
- Replay protection is the point: without the nonce, any ID token minted for
  this app that leaks (logs, history, a malicious extension) could be
  replayed to open a session.

#### Request

`google.protobuf.Empty`.

#### Response

**GoogleSignInChallenge:**

| Field | Type | Description |
| --- | --- | --- |
| nonce | string | Base64url, 43 chars; single-use; expires in 5 minutes. |

---

### 4. LogInWithGoogle

**Method:** `LogInWithGoogle`
**Route:** `POST /api/connect/auth.v1.AuthService/LogInWithGoogle`

#### Notes

- **The client is never trusted to say who it is.** The request carries only
  the raw ID token; identity (Google `sub`, email, name, picture) is read
  from claims *after* `google-auth-library` verifies signature (against
  Google's rotating public keys), issuer, audience, and expiry. There is
  deliberately no email or name field on the request.
- **Audiences:** the web client id plus any `GOOGLE_MOBILE_CLIENT_IDS`
  (Android/iOS mint tokens naming themselves as audience). ID-token flow —
  no code exchange, therefore **no client secret exists**; never add one.
- **Nonce check:** the token's `nonce` claim must match shape and consume an
  unexpired stored challenge (single use).
- **Verified email required.** Linking an existing row on an unverified
  address is account takeover (anyone able to put someone else's address on
  a Google account would inherit their ledger). Gmail is always verified;
  Workspace-hosted domains are the real guard case.
- **Three cases, in order:**
  1. `google_sub` already linked → sign in.
  2. Verified email matches an existing account → **link** the Google
     account to it. The account keeps the name its owner chose.
  3. Nobody → create the account (name falls back to the email local-part;
     avatar color derived from the email).
- **TOCTOU:** a concurrent sign-in (double-clicked button, two tabs) losing
  the unique-index race on email/google_sub re-reads the winner instead of
  surfacing a 500 — both attempts were the same successful sign-in.
- **Avatar refresh:** a changed Google photo is written on every sign-in, not
  only at creation — the URLs are not contractually stable, so a stored,
  never-refreshed one eventually points at nothing.
- All verification failures (bad signature, wrong audience, expired, missing
  claims, bad nonce) are indistinguishable on purpose: `Unauthenticated`
  "could not verify that Google account".

#### Request

| Field | Type | Description |
| --- | --- | --- |
| id_token | string | Raw JWT credential from Google Identity Services. |

#### Response

**AuthResponse** (delivery rules as above).

---

### 5. LogOut

**Method:** `LogOut`
**Route:** `POST /api/connect/auth.v1.AuthService/LogOut`

#### Notes

- Requires authentication. Bumps the user's `token_version`, which **revokes
  every outstanding token on every device**, then expires the session cookie.
- The one RPC exempt from sliding session renewal — a renewal on the way out
  would race the cookie clear and the mobile token delete.

#### Request / Response

`google.protobuf.Empty` both ways.

---

### 6. GetMe

**Method:** `GetMe`
**Route:** `POST /api/connect/auth.v1.AuthService/GetMe`

#### Notes

- Returns the caller's **private** projection: email, phone, and real
  `onboarded` state included (the only endpoint family where they are).
- `Unauthenticated` when the account row no longer exists (e.g. deleted).

#### Request

`google.protobuf.Empty`.

#### Response

`common.v1.User` (private projection).

---

### 7. UpdateProfile

**Method:** `UpdateProfile`
**Route:** `POST /api/connect/auth.v1.AuthService/UpdateProfile`

#### Notes

- **Fields:** `name` (required, trimmed, bounded), `default_currency`
  (optional — empty leaves it unchanged; validated against the supported
  allowlist).
- **`payment_handles` is retired.** Payment methods have their own service
  ([payment-service.md](../payment/payment-service.md)). A request that
  still carries a non-blank handle comes from a client loaded before the
  change and is refused whole with `FailedPrecondition` ("payment methods
  have moved, refresh the app to edit them"): saving the name while dropping
  the handle would report success for half of what was typed. Blank or
  absent handles are ignored, since that older form sends one for every
  field left empty.
- Changing `default_currency` changes which currency every legacy
  single-number balance field reports; the per-currency lists are unaffected.

#### Request

**UpdateProfileRequest:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | New display name (required). |
| default_currency | string | ISO 4217; empty = unchanged. |
| payment_handles | repeated PaymentHandle | Retired. A non-blank handle refuses the request; see the notes. |

**Sample Request (JSON):**

```json
{
  "name": "Anirudha",
  "defaultCurrency": "BDT"
}
```

#### Response

`common.v1.User` — the refreshed private projection.

---

### 8. SetPhone

**Method:** `SetPhone`
**Route:** `POST /api/connect/auth.v1.AuthService/SetPhone`

Puts a phone number on the caller's account once an SMS code proves they
hold it. One RPC, two calls:

| Call | `verification_code` | What happens |
| --- | --- | --- |
| First | empty | The server records its own verification state, bound to **this account and this number**, then an SMS code is sent (Twilio Verify). The row's expiry is provisional until Twilio accepts the send; the answer names the verification it reached, and the row follows it: the **same verification** (a resend inside its ten minutes, which texts the same code) keeps the row's attempt count and expiry, as Twilio does; **one this send created** (including the first after a send that failed) starts the count afresh and counts ten minutes from when Twilio created it; one created earlier while the row already followed the number (a send that only looked failed) keeps the row's count; and **one started before the row followed it** (the account switched numbers and back, or another account holds the number) starts the count at zero marked unknown (`checks_known`), so a wrong code is refused without naming the tries left. Refused while the verification is out of checks, with the minutes left. **No account data is read or changed.** Response: `verification_sent: true`. |
| Second | the received code | A code that is not exactly 8 digits is refused first, naming both lengths, and costs nothing. Then an attempt is spent from the server-side budget (5 per verification, refused before the provider is even called once exhausted or when no live verification exists for this account+number), possession is confirmed with the provider, the verification is **consumed** (single-use on our side, whatever the provider's semantics), then the number is resolved (below). The writes after a refusal (forgotten when Twilio no longer holds it, locked at Twilio's limit) name the verification that was checked, by number and Twilio id, so a late answer cannot touch a newer verification another session started meanwhile. Approval consumes the account's verification of that number whichever id it follows by then (a resend may have written one while the check was in flight), and never another number's. |

#### Notes

- **Normalization:** any typed format; normalized to E.164 (`InvalidArgument`
  with a format hint otherwise).
- After confirmation, two outcomes, and the response carries `user` in both:
  1. **Number free (or already the caller's):** written to the account. A
     TOCTOU race (another account takes the partial unique index between
     lookup and update) is re-read and becomes the transfer below.
  2. **Held by another account: a TRANSFER, not a refusal (§34).** Numbers
     move — lost SIMs, temporary SIMs — and SMS possession is the definition
     of holding one. One transaction locks both rows (sorted `FOR UPDATE`),
     re-checks the holder still holds it, frees it, attaches it, and
     notifies **both parties** (`phone_transferred`) on the transfer's own
     transaction — the loser's notification is the theft alarm and tells
     them how to take the number back (verify it again) or object. Safe
     because a phone is a directory pointer and **never an authenticator**
     (sign-in uses Google or Apple). Refused (`FailedPrecondition`) only when
     the number is the holder's sole identifier, which would strand that
     account.
- **Nothing is merged.** Every row that can hold a number belongs to somebody
  who signed up, so verifying a number never absorbs another account or its
  history; `pending_merge` and `merge_token` are never set.
- **Verification is stored, not inferred (§35):** every write through this
  endpoint stamps
  `users.phone_verified_at`, surfaced privately as `User.phone_verified`.
  Numbers written before verification existed carry no stamp; the clients
  show them as unverified, prompt after login, and re-run this same flow on
  the number already held (outcome 1's "already the caller's" branch) to
  earn it. Clearing or transferring the number clears the stamp with it.
- **Provider behavior:** codes are **8 digits**, the Twilio Verify service's
  "Code length" setting, mirrored by `VERIFICATION_CODE_LENGTH` in
  `packages/shared/src/phone/phone.constants.ts`; change both together, and
  ship both apps, which keep the length they were built with. Twilio starts
  a service at 6. At start-up `reportCodeLengthMismatch` (run from
  `src/instrumentation.ts`) reads the service and logs `phone verification
  service texts codes of another length` when the two differ; it refuses
  nothing.
  Provider outages surface as `Unavailable` "phone verification is
  temporarily unavailable", and so does a check Twilio refuses as a bad
  request (HTTP 400, such as 60200), which is logged with Twilio's status
  and error code: only whole 8-digit codes are sent, so it points at the
  setup, never at the person's code. Every refused code is `InvalidArgument`, worded
  for what happened: a wrong code says how many tries are left, unless the row cannot know (`checks_known` false); a
  verification Twilio no longer holds is forgotten here too ("no longer
  active, send a new one"); Twilio's own check limit (error 60202) locks the
  verification here until it expires. Missing Twilio configuration fails
  closed. Provider diagnostics go to the log, never the client.
- **Wrong-code log line:** `phone verification code rejected` carries the
  attempt number, seconds since the first send, and keyed fingerprints of
  the verification and of the code within it, never the code or the
  number. The same code entered twice in one verification shows the same
  fingerprint.
- **Rate limits:** per account, 3/min for the SMS-sending call and 5/min for
  code checks, each in its own bucket; the SMS-sending call additionally
  3/hour + 8/day per destination and 20/hour per client IP.
  The usecase decides which call it is (on the trimmed code) and runs the
  limits the handler hands it; a send refused for the lockout is refused
  before any of them counts it.

#### Request

**SetPhoneRequest:**

| Field | Type | Description |
| --- | --- | --- |
| phone | string | Any format the user typed; normalized server-side. |
| verification_code | string | Empty on the first call; the SMS code on the second. |

#### Response

**SetPhoneResponse:**

| Field | Type | Description |
| --- | --- | --- |
| verification_sent | bool | True after the SMS was accepted by the provider; ask for the code and call again. |
| user | User | Set once the code checked out and the number is on the caller's account. |
| pending_merge | MergePreview | **Deprecated**, never set: there is nothing to merge. |
| merge_token | string | **Deprecated**, always empty. |

**Sample second-call response:**

```json
{
  "user": {
    "id": "1c9e...", "email": "rifat@example.com", "name": "Rifat",
    "phone": "+14155552671", "phoneVerified": true, "registered": true
  }
}
```

---

### 9. ConfirmPhoneMerge

**Method:** `ConfirmPhoneMerge`
**Route:** `POST /api/connect/auth.v1.AuthService/ConfirmPhoneMerge`

#### Notes

- **Retired.** It merged a placeholder row someone had been invited into
  with the caller's account; no such row exists any more (see
  [The Identity Model](#the-identity-model)) and SetPhone never offers a
  merge. It stays in the proto, marked deprecated, so an installed app that
  still calls it gets an answer it can show: always `FailedPrecondition`
  "there is nothing to merge — update HaalKhata and verify your number
  again". Nothing is read or written.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| merge_token | string | Ignored. |

#### Response

Never returns; always refused.

---

### 10. RemovePhone

**Method:** `RemovePhone`
**Route:** `POST /api/connect/auth.v1.AuthService/RemovePhone`

#### Notes

- Detaches the caller's phone number — the release valve for a lost or
  recycled number, without which a number could only ever leave an account
  by somebody else verifying it.
- **Refused** (`InvalidArgument`) when the phone is the account's only
  identifier: the database's `chk_users_has_identifier` requires every live
  row to stay reachable by something, and this check turns that constraint
  into a sentence instead of an internal error.
- A no-op success when no phone is set. Rate-limited in its own bucket
  (`phone:remove`, 5/min per account).

#### Request

`google.protobuf.Empty`.

#### Response

`common.v1.User` — the refreshed private projection with `phone: ""`.

---

### 11. CompleteOnboarding

**Method:** `CompleteOnboarding`
**Route:** `POST /api/connect/auth.v1.AuthService/CompleteOnboarding`

#### Notes

- Marks the first-run flow finished, **including when every field was
  skipped** — deriving "done" from a filled-in profile column would re-prompt
  forever anyone who declined. Idempotent.

#### Request

`google.protobuf.Empty`.

#### Response

`common.v1.User` — refreshed private projection with `onboarded: true`.

---

### 12. Apple sign-in

`BeginAppleSignIn`, `LogInWithApple`, and `CompleteAppleSignIn` are available in
production. Implementation:
[appleSignIn.usecase.ts](../../../apps/web/src/server/auth/usecase/apple/appleSignIn.usecase.ts)
and [apple.provider.ts](../../../apps/web/src/server/auth/usecase/apple/apple.provider.ts).

| RPC | Request | Result |
| --- | --- | --- |
| `BeginAppleSignIn` | `browser_flow`, `mobile`, `verifier_hash` | `nonce`, optional `authorization_url` |
| `LogInWithApple` | Native `id_token`, `authorization_code`, first-use `name` | `AuthResponse` |
| `CompleteAppleSignIn` | Browser callback `state` plus the initiating client's `verifier` | `AuthResponse` |

Native iOS uses the bundle ID audience and a server-issued one-use nonce.
The server verifies both the supplied ID token and the code-exchange token,
including Apple issuer, RS256 signature, audience, expiry, issuance time,
subject, nonce and verified email. It refuses mismatched identities before
binding an account. Apple first-use names are untrusted: provider names pass
bounded text filtering and fall back to `Member`; an existing chosen profile
name is retained.

Web/Android use the Services ID and the fixed HTTPS form-post callback
`/api/auth/apple/callback`. The database holds hashes of nonce/state/verifier.
A redirect contains only state and a sanitized status; session issuance requires
the original client verifier and consumes the completed challenge once. No
bearer token is put in a redirect URL.

Verified email links the existing account that holds it (which keeps its
chosen name); otherwise a new account is created with its Apple identity in
the same insert, since `chk_users_can_sign_in` refuses a row nobody can sign
in to. Apple private
relay addresses are supported. Refresh grants are encrypted with AES-256-GCM
using the server-only stable `APPLE_TOKEN_ENCRYPTION_KEY`. The original `.p8`
uses `APPLE_PRIVATE_KEY(_FILE)`. See the
[release handoff](../../../docs/mobile-app-store-readiness.md) for Apple
capabilities, grouped IDs, key files and deploy variables.

### 13. DeleteAccount

`POST /api/connect/auth.v1.AuthService/DeleteAccount` takes
`{ "confirmation": "DELETE" }` and returns `google.protobuf.Empty`. The target
is always the authenticated caller; a user ID cannot be supplied by the client.

[accountDeletion.usecase.ts](../../../apps/web/src/server/auth/usecase/deletion/accountDeletion.usecase.ts)
locks the account, revokes its encrypted Apple grants and erases personal data
within one database transaction. A provider failure leaves the local account
intact and retryable. Outstanding balances never prevent deletion.

The original user row, credentials, personal notification/activity history,
comments, payment handles, pending requests and invite links are removed.
Safety reports/blocks referencing the account cascade away. Shared financial
references move to a fresh anonymous member with `deleted_at`; descriptions,
notes and item labels owned by the account are redacted. Cents and currencies
are preserved. Group ownership transfers deterministically to a remaining
member where one exists. The original ID cannot authenticate, and
clients clear their sessions and private query caches after success.

Backup expiry and reapplying deletion after a restore are operator duties in
[the server runbook](../../../ops/README.md). Both apps present the same
shared deletion explanation before requesting the exact confirmation.

### 14. SetContactDiscovery

`POST /api/connect/auth.v1.AuthService/SetContactDiscovery` takes
`{ "discoverable": true | false }` and returns the caller's own
`common.v1.User`, whose private `contact_discovery` field is `ON`, `OFF` or,
for an account that never answered, `UNSPECIFIED`. Being findable is the
default: `UNSPECIFIED` matches like `ON`, and only `OFF` hides the account.
Every account that predates the field starts `UNSPECIFIED`, and both apps
tell such a person once that they can be found, with **Turn off** beside
**Keep it on**. The answer decides
whether `SocialService.FindContacts` can match the account by its verified
phone or sign-in email; see [Find friends from contacts](../../contact-discovery.md).
