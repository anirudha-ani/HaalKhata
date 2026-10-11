# Admin Analytics Service (`adminanalytics.v1.AdminAnalyticsService`)

Product usage for the operator: how many people use the app and how much
they do with it. It backs the usage page on the admin hostname.

The Admin Analytics Service is essential for:

- **Seeing whether the product is used:** sign-ups, activity, expenses by
  split type, payments, receipt scans, and a twelve-week trend.
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
description, group name or comment text. This is a property of the SQL, not
of a mapper: no statement in `usage.repo.ts` selects any of those columns, so
there is nothing for a later layer to forget to drop. Per-person counts are
joined on the user id **inside the database** and the id is not selected.

What it does contain about a person: the display name they chose, the day
they finished signing up, and how many expenses, payments and receipt scans
they added. People who were invited but never signed in are counted and
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
| This service's RPCs | Served | 404 |
| Every other service's RPCs | 404 | Served |

- One function decides (`requestSurface`), and it is applied three times:
  the page proxy, the Connect mount (before the CSRF guard or the database),
  and each handler of this service.
- With `ADMIN_HOST` unset, production has **no admin surface at all**.
  Development serves both from whatever host it runs on, since there is only
  one localhost.
- 404 rather than a redirect in both directions: a redirect would tell a
  stranger probing the app that an admin page exists.
- The `Host` header is the caller's to choose, so the surface is not the
  access control. That is the session, below. What the separate origin buys
  is browser isolation (session cookies here are host-only, so a script on
  the app's origin has no admin cookie to send) and a smaller attack surface
  on each side.

## Sign-in and Sessions

An admin is **a Google identity on the operator allowlist, not an account in
the app**.

- `ADMIN_EMAILS` (comma separated) is the allowlist. Empty means nobody.
- `SignIn` verifies the Google ID token exactly as the app's sign-in does
  (signature, issuer, expiry, verified email, single-use server nonce), but
  accepts **only the web client's id** as its audience, so a token minted
  for the Android or iOS app cannot be replayed here.
- It then checks the verified address against the allowlist. Nothing is
  written unless it matches, and **no `users` row is created, linked or read
  either way**.
- The session is an opaque 32-byte random token, stored only as its SHA-256
  in `admin_sessions`. It lives in a host-only, `HttpOnly`,
  `SameSite=Strict` cookie (`__Host-hk_admin` in production) for 8 hours
  with no renewal.
- `SignOut` deletes the row; the token is dead at once.
- The allowlist is checked again on **every request**. Removing an address
  from `ADMIN_EMAILS` ends its sessions as soon as the server restarts with
  the new value.
- An app session is not an admin session: it has the wrong shape, lives in a
  different cookie, and an `Authorization` header is never read here.
- Cookie-carrying POSTs go through the same CSRF guard as the app's (the
  `Origin` must match the `Host`).

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| BeginSignIn, SignIn | 5/min per client address, shared |
| GetUsageOverview | 30/min across all admin sessions |

## What the Counts Mean

- **Registered** people have signed in (a Google account or, in development,
  a password). Merge tombstones are neither registered nor invited.
- **Active** in 7 / 30 days: distinct people who did anything that reaches
  the feed. The `activity` table already records every such action with its
  actor, so no tracking table exists for this.
- **Joined** is `COALESCE(onboarded_at, created_at)`: the moment someone
  finished signing up, not the moment a friend first typed their name.
- **Expenses** count everything ever added, deleted ones included;
  `deleted_expense_count` says how many were later deleted.
- **Payments** exclude a net settlement's cancelling (`offset`) entries.
- **Receipt scans** are counted from the day scan counting shipped.
- Weeks start on **Monday, UTC**, the boundary `date_trunc('week')` uses.
- The whole overview is read inside one `snapshot()`.

---

## Overview of Endpoints

1. [BeginSignIn](#1-beginsignin)
2. [SignIn](#2-signin)
3. [SignOut](#3-signout)
4. [GetUsageOverview](#4-getusageoverview)

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

- Deletes the session row and expires the cookie. The cookie is expired even
  when the row could not be deleted.
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
| weeks | repeated WeekUsage | The trailing twelve weeks, oldest first, no gaps. |
| users | repeated UserUsage | People who have signed in, newest first. |
| users_truncated | bool | True when there are more people than `users` lists. |

**UserUsage:**

| Field | Type | Description |
| --- | --- | --- |
| name | string | The person's display name. |
| joined_on | string | The day they finished signing up, `YYYY-MM-DD`, UTC. |
| expenses_by_split_type | repeated SplitTypeCount | Expenses they added, by split type. |
| payment_count | int32 | Payments they recorded. |
| receipt_scan_count | int32 | Receipt scans they attempted. |
