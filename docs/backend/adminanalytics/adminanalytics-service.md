# Admin Analytics Service (`adminanalytics.v1.AdminAnalyticsService`)

Product usage for the operator: how many people use the app and how much
they do with it. It backs the usage page on the admin hostname.

The Admin Analytics Service is essential for:

- **Seeing whether the product is used:** sign-ups, activity, expenses by
  split type, payments, receipt scans, and a trend over time that can be
  read by week or by month for any stretch back to the start.
- **Doing so without a view onto accounts:** the contract carries counts and
  display names, and nothing else.

Implementation: [handler.ts](../../../apps/web/src/server/adminanalytics/handler.ts)
→ [adminSession.usecase.ts](../../../apps/web/src/server/adminanalytics/usecase/adminSession.usecase.ts)
and [usage.usecase.ts](../../../apps/web/src/server/adminanalytics/usecase/usage.usecase.ts)
→ [usage.repo.ts](../../../apps/web/src/server/adminanalytics/repo/usage.repo.ts)
and [adminSessions.repo.ts](../../../apps/web/src/server/adminanalytics/repo/adminSessions.repo.ts).
The hostname routing lives in
[config/adminSurface.ts](../../../apps/web/src/config/adminSurface.ts).

---

## What the Overview Never Contains

No email, phone number, avatar, account id, amount of money, expense
description, group name, comment text or payment method. This is a property of the SQL, not
of a mapper: no statement in `usage.repo.ts` selects any of those columns, so
there is nothing for a later layer to forget to drop. Per-person counts are
joined on the user id **inside the database** and the id is not selected.

What it does contain about a person: the display name they chose, the day
they finished signing up, and how many expenses, payments and receipt scans
they added.

A display name is free text, so "names only" is enforced on its content as
well: a name that contains `@`, a name made of digits and phone punctuation,
and a name equal to the part of the person's email before the `@` (what
sign-in falls back to when Google supplies no name) all come back empty, and
the page shows "Name hidden". The last comparison happens inside the
database and returns only the verdict. The person is still counted and
listed, so the totals and the table agree. People who were invited but never signed in are counted and
never listed: they have not joined and did not choose to be here.

An integration test seeds people with emails, a phone number, a picture URL,
amounts, descriptions and group names, then searches the entire response for
each of them.

## The Admin Surface

The page and this service are served from their own hostname (`ADMIN_HOST`;
`admin.haalkhata.app` in production) by the same container as the app.

| Request | On the admin hostname | On the app's hostnames |
| --- | --- | --- |
| The admin page | Served (the root redirects to it) | 404 |
| Any other page | 404 | Served |
| This service's and AdminModerationService's RPCs | Served | 404 |
| Every other service's RPCs | 404 | Served |

- One function decides (`requestSurface`), and it is applied three times:
  the page proxy, the Connect mount (before the CSRF guard or the database),
  and each handler of both admin services.
- With `ADMIN_HOST` unset, production has **no admin surface at all**.
  Development serves both from whatever host it runs on, since there is only
  one localhost.
- 404 rather than a redirect in both directions, so neither hostname ever
  hands a visitor across to the other. This keeps the two apart; it does not
  hide the admin page, whose hostname is in this repository.
- The `Host` header is the caller's to choose, so the surface is not the
  access control. That is the session, below. What the separate origin buys
  is a smaller attack surface on each side, and that a page on one origin
  cannot read the other's responses.
- **The two hostnames are the same site**, so `SameSite` does not separate
  them: a request to the admin host started by a script on the app's
  hostname would carry the admin cookie. Two things stop it, and both are
  load-bearing. Every admin RPC checks for itself that the request's
  `Origin` is the admin host (no exemption for a bearer header, unlike the
  app's CSRF guard, and whether or not a cookie is present). And nothing
  sends a CORS header, so such a script could not read a response anyway.
  **Never add CORS headers on the admin host.**

## Sign-in and Sessions

An admin is **a Google identity on the operator allowlist, not an account in
the app**.

- `ADMIN_EMAILS` (comma separated) is the allowlist. Empty means nobody.
- `SignIn` verifies the Google ID token exactly as the app's sign-in does
  (signature, issuer, expiry, verified email, single-use server nonce), but
  accepts **exactly one audience**: the client the admin page signs in with.
  A token minted for the Android or iOS app cannot be replayed here.
- That client is `ADMIN_GOOGLE_CLIENT_ID` when set, otherwise the app's web
  client. A dedicated client, authorized for the admin origin only, is the
  stricter setup: Google mints a token for a client only from one of its
  authorized origins, so with a shared client a script injected into the app
  could ask Google for a token as the signed-in operator and present it
  here, and with a dedicated one no page on the app's origin can obtain a
  token this surface accepts. The page receives the id from the server at
  request time, so it is not a build argument. It is in addition to
  `GOOGLE_CLIENT_ID`, which must be set either way.
- It then checks the verified address against the allowlist. Nothing is
  written unless it matches, and **no `users` row is created, linked or read
  either way**.
- The session is an opaque 32-byte random token, stored only as its SHA-256
  in `admin_sessions`. It lives in a host-only, `HttpOnly`,
  `SameSite=Strict` cookie (`__Host-hk_admin` in production) for 8 hours
  with no renewal.
- `SignOut` deletes the row; the token is dead at once. The cookie is
  expired only after the row is gone: if the delete fails the operator is
  still signed in, is told so, and can try again, rather than being left
  with a live session they have no way to end.
- The allowlist is checked again on **every request**. Removing an address
  from `ADMIN_EMAILS` ends its sessions as soon as the server restarts with
  the new value.
- An app session is not an admin session: it has the wrong shape, lives in a
  different cookie, and an `Authorization` header is never read here.
- Every RPC of this service, sign-in included, requires an `Origin` that
  names the admin host itself; anything else is `PermissionDenied` before a
  cookie is read or a rate-limit slot is spent. This is in addition to the
  mount's CSRF guard.

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| BeginSignIn, SignIn | 5/min per client address, shared |
| GetUsageOverview | 30/min across all admin sessions |
| GetUsageTrend | 60/min across all admin sessions (each Earlier or Later is one) |

## What the Counts Mean

- **Registered** people have signed in (Google, Apple or, in development, a
  password). Merge tombstones, and the anonymous stand-ins account deletion
  leaves in shared ledgers, are neither registered nor invited.
- **Active** in 7 / 30 days: distinct people who did anything that reaches
  the feed. The `activity` table already records every such action with its
  actor, so no tracking table exists for this.
- **Joined** is `COALESCE(onboarded_at, created_at)`: the moment someone
  finished signing up, not the moment a friend first typed their name.
- **Expenses** count everything ever added, deleted ones included;
  `deleted_expense_count` says how many were later deleted.
- **Payments** exclude a net settlement's cancelling (`offset`) entries.
- **Receipt scans** are counted from the day scan counting shipped, and only
  once the person has allowed AI scanning: a scan refused for want of
  permission never reached a provider. Deleting an account deletes its scans.
- **Payment methods** are counted, and how many people have saved one. A
  method's name and details, and the name a payment keeps of the method it
  was made with (`settlements.method_label`), are never read here: they say
  where a person's money goes, and reach only someone who owes that person
  (see [payment-service.md](../payment/payment-service.md)).
- Weeks start on **Monday, UTC**, and months on the 1st, the boundaries
  `date_trunc` uses.
- The whole overview is read inside one `snapshot()`, and so is each
  window of the trend.

---

## Overview of Endpoints

1. [BeginSignIn](#1-beginsignin)
2. [SignIn](#2-signin)
3. [SignOut](#3-signout)
4. [GetUsageOverview](#4-getusageoverview)
5. [GetUsageTrend](#5-getusagetrend)

---

### 1. BeginSignIn

**Method:** `BeginSignIn`
**Route:** `POST /api/connect/adminanalytics.v1.AdminAnalyticsService/BeginSignIn`

#### Notes

- **Unauthenticated.** Issues the single-use, five-minute nonce Google must
  copy into the ID token. The same challenge store the app's sign-in uses.
- `InvalidArgument` when Google sign-in is not configured on the server.

#### Response

**BeginSignInResponse:**

| Field | Type | Description |
| --- | --- | --- |
| nonce | string | Server-issued value to pass to Google as the nonce. |

---

### 2. SignIn

**Method:** `SignIn`
**Route:** `POST /api/connect/adminanalytics.v1.AdminAnalyticsService/SignIn`

#### Notes

- **Unauthenticated.** On success sets the admin session cookie and returns
  an empty message: nothing readable by script comes back.
- `Unauthenticated` when the token fails verification or its nonce is
  unknown, expired or already used.
- `PermissionDenied` when the verified address is not on the allowlist. The
  refusal is logged without the address.

#### Request

**SignInRequest:**

| Field | Type | Description |
| --- | --- | --- |
| id_token | string | The credential Google Identity Services handed the browser. |

---

### 3. SignOut

**Method:** `SignOut`
**Route:** `POST /api/connect/adminanalytics.v1.AdminAnalyticsService/SignOut`

#### Notes

- Deletes the session row, then expires the cookie. When the row could not
  be deleted the call fails and the cookie is left alone, so sign-out can be
  retried.
- Safe to repeat, and not an error without a session.

---

### 4. GetUsageOverview

**Method:** `GetUsageOverview`
**Route:** `POST /api/connect/adminanalytics.v1.AdminAnalyticsService/GetUsageOverview`

#### Notes

- Requires a live admin session; `Unauthenticated` otherwise.
- `users` is capped at 500, newest first; `users_truncated` says when that
  applied. The totals count everyone regardless.

#### Response

**UsageOverview:**

| Field | Type | Description |
| --- | --- | --- |
| generated_at | string | RFC 3339 instant the figures were read. |
| totals | UsageTotals | Product-wide counts. |
| expenses_by_split_type | repeated SplitTypeCount | Every expense ever added, by split type, most used first. |
| users | repeated UserUsage | People who have signed in, newest first. |
| users_truncated | bool | True when there are more people than `users` lists. |

**UserUsage:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | The person's display name; empty when the name is itself contact information (see above). |
| joined_on | string | The day they finished signing up, `YYYY-MM-DD`, UTC. |
| expenses_by_split_type | repeated SplitTypeCount | Expenses they added, by split type. |
| payment_count | int32 | Payments they recorded. |
| receipt_scan_count | int32 | Receipt scans they attempted. |

---

### 5. GetUsageTrend

**Method:** `GetUsageTrend`
**Route:** `POST /api/connect/adminanalytics.v1.AdminAnalyticsService/GetUsageTrend`

#### Notes

- Requires a live admin session; `Unauthenticated` otherwise.
- One window of twelve weeks or twelve months: new people, expenses,
  payments and receipt scans per period, the same definitions as the
  overview's totals.
- The page names a day and the server does all the calendar math. A day
  after today is read as today. A day whose window would open before the
  first thing that ever happened (someone joining, an expense, a payment
  or a scan) is read as the first window, so no window is a run of empty
  bars from before there was anything to count.
- The answer says where the page can go next: `earlier_end_on`,
  `later_end_on` and `first_end_on`, each empty when there is nowhere to
  go. The page sends one of these back, or a period's `end_on` when the
  operator switches between weeks and months, so the place in time is kept.
- `InvalidArgument` for an `end_on` that is not a real day.

#### Request

| Field | Type | Description |
| --- | --- | --- |
| unit | TrendUnit | `TREND_UNIT_WEEK` (also for unspecified) or `TREND_UNIT_MONTH`. |
| end_on | string | A day, `YYYY-MM-DD`, inside the last period to show; empty for today. |

#### Response

**UsageTrend:**

| Field | Type | Description |
| --- | --- | --- |
| generated_at | string | RFC 3339 instant the figures were read. |
| unit | TrendUnit | The unit answered in. |
| periods | repeated TrendPeriod | Twelve periods, oldest first, no gaps. |
| earlier_end_on | string | `end_on` for the window just before; empty when nothing happened earlier. |
| later_end_on | string | `end_on` for the window just after; empty when this one holds today. |
| first_end_on | string | `end_on` for the first window with anything in it; empty when this is it. |

**TrendPeriod:**

| Field | Type | Description |
| --- | --- | --- |
| start_on, end_on | string | The period's first and last day, `YYYY-MM-DD`, UTC. |
| new_user_count | int32 | People who finished signing up in it. |
| expense_count | int32 | Expenses added in it, deleted ones included. |
| payment_count | int32 | Payments recorded in it, not counting a net settlement's cancelling entries. |
| receipt_scan_count | int32 | Receipt scans attempted in it. |
