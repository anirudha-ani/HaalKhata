# Auth Service (`auth.v1.AuthService`)

Authentication, sessions, the caller's profile, phone verification, and the
account merge a phone collision triggers.

The Auth Service is essential for:

- **Sign-in:** Google is the only way in for new production clients; retired
  email/phone + password flows survive for local development and seeded
  accounts.
- **Sessions:** every auth RPC returns a bearer token for mobile clients and
  sets an HttpOnly session cookie for browsers — never both to the same
  client.
- **Shadow-user claiming:** an invited person who signs in with the matching
  email (or verifies the matching phone) inherits the expense history written
  against their invitation.
- **Profile:** display name, default currency, payment handles, onboarding
  state.

Implementation: [handler.ts](../../../apps/web/src/server/auth/handler.ts) →
[auth.usecase.ts](../../../apps/web/src/server/auth/usecase/auth.usecase.ts),
[accountMerge.usecase.ts](../../../apps/web/src/server/auth/usecase/accountMerge.usecase.ts),
[phoneVerification.ts](../../../apps/web/src/server/auth/usecase/phoneVerification.ts).
Session mechanics (token format, sliding renewal, revocation, cookie rules)
are documented once in
[conventions.md § Authentication & Sessions](../common/conventions.md#authentication--sessions).

---

## The Identity Model

An account (`users` row) can hold up to three identifiers — email, phone
(E.164), Google `sub` — and is **claimed** when it has a password hash or a
Google link. Everything else is an *unclaimed invite* (shadow user):

| State | password_hash | google_sub | Meaning |
| --- | --- | --- | --- |
| Shadow | null | null | Created by an invite; claimable by whoever proves the identifier |
| Password account | set | null | Dev/seeded account |
| Google account | null (usually) | set | The production case |

**Claiming paths:**

- **By email:** `SignUp` (dev) with a matching email claims the row; Google
  sign-in with a matching *verified* email links the row (and, for a shadow
  row, adopts Google's display name over the local-part placeholder).
- **By phone:** `SetPhone` + SMS verification. Since the caller already has
  an account, a colliding shadow row cannot simply be claimed — it must be
  **merged** into the caller's account (`ConfirmPhoneMerge`), which is why
  phone gets its own two-RPC flow instead of a field on `UpdateProfile`.

**Recycled-number defense:** possession of a number proves control *today*,
not when old invitations were written. So a collision never merges silently —
the caller is shown exactly what they would absorb (names, counts, balances)
and must confirm.

## Merge Tokens

The pending merge between `SetPhone` and `ConfirmPhoneMerge` is carried by a
signed stateless token, not a table:
`<keeperId>.<loserId>.<phone>.<previewFingerprint>.<expiry>.<hmac>` with a
`phone-merge` purpose prefix (so it can never validate as a session token).
It binds keeper, loser, and phone — it cannot be replayed to absorb a
different row — plus a **fingerprint of the previewed history** (name,
expense count, per-currency nets): `ConfirmPhoneMerge` recomputes the
preview and refuses on drift, so nobody absorbs materially different
balances than they were shown. It expires after **10 minutes**. Every failure mode (expired, forged,
malformed) yields one message: *"that confirmation is no longer valid, please
try again"*. A token presented by a different account than it was issued to
is `PermissionDenied` — the merge must land on the account that saw the
preview.

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| SignUp, LogIn, BeginGoogleSignIn, LogInWithGoogle | 10/min per client IP |
| SetPhone with empty code (the SMS send) | 3/min per account, plus 3/hour + 8/day per destination number (across all accounts) and 20/hour per client IP — the ceilings are **durable** (Postgres `phone_send_events`), surviving restarts and replicas |
| SetPhone with a code (the check) | 5/min per account, and at most **5 wrong codes per delivered SMS** (server-side attempt budget) |
| ConfirmPhoneMerge, RemovePhone | 5/min per account |

The per-destination limits exist because a per-account limit alone lets
anyone with several accounts point all of them at one victim number (SMS
pumping / harassment). Destination keys are a purpose-bound HMAC of the
number, never the raw number. The buckets are split so a fumbled code
cannot lock the user out of the merge confirmation.

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
9. [ConfirmPhoneMerge](#9-confirmphonemerge)
10. [RemovePhone](#10-removephone)
11. [CompleteOnboarding](#11-completeonboarding)

---

### 1. SignUp

**Method:** `SignUp`
**Route:** `POST /api/connect/auth.v1.AuthService/SignUp`

#### Notes

- **Production-disabled.** `PermissionDenied` ("sign in with Google to
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
- **Shadow claiming:** an existing row with that identifier and no credential
  is *claimed* — name and password written, history kept. A row with a
  password **or a Google link** refuses with `AlreadyExists`; treating a
  passwordless Google account as claimable would let anyone who knows the
  address take it over through this form.
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

**AuthResponse** — the created (or claimed) user as the caller's private
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
- **One generic failure.** Unknown identifier, unclaimed shadow row, wrong
  password, and an oversized password (rejected *before* scrypt runs — DoS
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
  2. Verified email matches an existing row → **link** the Google account.
     A shadow row also adopts Google's display name (its own is a
     placeholder).
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
- `Unauthenticated` when the account row no longer exists (e.g. merged away).

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
  allowlist), `payment_handles` (optional — when present, **replaces the
  caller's whole set**; an entry with an empty handle removes that method).
- Handle validation: method must be a known key (`venmo`/`zelle`/`cashapp`/
  `paypal`), handle ≤ 120 chars, stored verbatim (opaque identifiers).
- **Atomic:** the whole request is validated up front, then profile row and
  handles are written in one transaction — the form either fully applies or
  not at all.
- Changing `default_currency` changes which currency every legacy
  single-number balance field reports; the per-currency lists are unaffected.

#### Request

**UpdateProfileRequest:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | New display name (required). |
| default_currency | string | ISO 4217; empty = unchanged. |
| payment_handles | repeated PaymentHandle | Full replacement set; empty handle = remove that method. |

**Sample Request (JSON):**

```json
{
  "name": "Anirudha",
  "defaultCurrency": "BDT",
  "paymentHandles": [
    { "method": "venmo", "handle": "@ani-p" },
    { "method": "zelle", "handle": "" }
  ]
}
```

#### Response

`common.v1.User` — the refreshed private projection.

---

### 8. SetPhone

**Method:** `SetPhone`
**Route:** `POST /api/connect/auth.v1.AuthService/SetPhone`

Claims a phone number for the caller's account, or previews the merge a
collision would require. One RPC, two calls:

| Call | `verification_code` | What happens |
| --- | --- | --- |
| First | empty | The server records its own verification state — bound to **this account and this number**, expiring in 10 minutes — then an SMS code is sent (Twilio Verify). **No account data is read or changed.** Response: `verification_sent: true`. |
| Second | the received code | An attempt is spent from the server-side budget (5 per delivered code, refused before the provider is even called once exhausted or when no live verification exists for this account+number), possession is confirmed with the provider, the verification is **consumed** (single-use on our side, whatever the provider's semantics), then the number is resolved (below). |

#### Notes

- **Normalization:** any typed format; normalized to E.164 (`InvalidArgument`
  with a format hint otherwise).
- After confirmation, three outcomes:
  1. **Number free (or already the caller's):** written to the account →
     response carries `user`. A TOCTOU race (someone claims the partial
     unique index between lookup and update) is re-read and fed through the
     same decisions below.
  2. **Held by a claimed account:** `AlreadyExists` — "that number is already
     on another account". Absorbing someone's live account is never right;
     support sorts out typos and recycled numbers.
  3. **Held by an unclaimed invited row:** nothing changes yet. The response
     carries `pending_merge` — what merging would absorb — plus a
     `merge_token` for [ConfirmPhoneMerge](#9-confirmphonemerge).
- The preview's balance buckets are per currency and int32-checked before
  being promised to a client; `net_cents` is the caller's-default-currency
  bucket only. Counterparty names are capped at 12, and every preview
  disclosure is logged (it reveals the previous number-holder's counterparty
  names to whoever holds the number today — the deliberate recycled-number
  defense, kept auditable).
- **Provider behavior:** codes are 4–10 digits; provider outages surface as
  `Unavailable` "phone verification is temporarily unavailable"; a wrong or
  expired code is `InvalidArgument`. Missing Twilio configuration fails
  closed. Provider diagnostics go to the log, never the client.
- **Rate limits:** 5/min per account across both calls; the SMS-sending call
  additionally 3/hour + 8/day per destination and 20/hour per client IP.

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
| user | User | Set when the number was free and simply written. |
| pending_merge | MergePreview | Set instead when an unclaimed invited row holds the number. |
| merge_token | string | Signed confirmation token; empty unless `pending_merge` is set. Expires in 10 minutes. |

**MergePreview:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | Name on the absorbed row (usually what the inviter typed). |
| expense_count | int32 | Undeleted expenses the row appears in. |
| net_cents | int32 | Legacy: net in the caller's default currency; positive = it is owed. |
| nets | repeated CurrencyAmount | The whole picture, per currency. |
| counterparty_names | repeated string | Who it shares expenses with — **the actual check**: someone who doesn't recognize these names should back out (recycled number). |

**Sample second-call response (collision case):**

```json
{
  "verificationSent": false,
  "pendingMerge": {
    "name": "Rifat (invited)",
    "expenseCount": 4,
    "netCents": -2350,
    "nets": [{ "currency": "USD", "cents": -2350 }],
    "counterpartyNames": ["Tanvir", "Sadia"]
  },
  "mergeToken": "1c9e….7a1b….+14155552671.1756694400.rYc…"
}
```

---

### 9. ConfirmPhoneMerge

**Method:** `ConfirmPhoneMerge`
**Route:** `POST /api/connect/auth.v1.AuthService/ConfirmPhoneMerge`

#### Notes

- Verifies the merge token (purpose, signature, expiry, **keeper = caller**),
  then **re-reads and re-checks the loser row** rather than trusting the
  token: in the seconds since the preview the row could have been claimed by
  its rightful owner (`AlreadyExists`), merged already (`NotFound`), or its
  phone changed (`InvalidArgument`, start over). The preview is then
  **recomputed and compared against the token's fingerprint** — balances
  that changed inside the ten-minute window refuse with "review it again",
  so the user only ever absorbs the history they actually read.
- The merge itself (`mergeAccounts`) runs in one transaction that takes the
  friend-request inbox locks for both accounts first (sorted — the same
  order every friend-request writer uses), then row locks. It rewrites every
  reference from loser to keeper (expenses, payers, splits, item
  assignments, settlements, comments, activity, group membership,
  friendships), collapses rows that a merge would make self-referential
  (self-settlements removed, duplicate splits summed), moves the phone to
  the keeper, and leaves the loser row as a **tombstone** (`merged_into`
  set) so old sessions and lookups resolve rather than dangle.
- Rate-limited with the phone bucket (5/min per account).

#### Request

| Field | Type | Description |
| --- | --- | --- |
| merge_token | string | The token handed back by SetPhone. |

#### Response

`common.v1.User` — the caller's account after absorbing the invited row
(history, balances, and the phone number now theirs).

---

### 10. RemovePhone

**Method:** `RemovePhone`
**Route:** `POST /api/connect/auth.v1.AuthService/RemovePhone`

#### Notes

- Detaches the caller's phone number — the release valve for a lost or
  recycled number, without which a number could only ever leave an account
  by somebody else claiming it.
- **Refused** (`InvalidArgument`) when the phone is the account's only
  identifier: the database's `chk_users_has_identifier` requires every live
  row to stay reachable by something, and this check turns that constraint
  into a sentence instead of an internal error.
- A no-op success when no phone is set. Rate-limited with the merge bucket
  (5/min per account).

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
