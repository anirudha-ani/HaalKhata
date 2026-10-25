<!-- The operator's report queue on the admin page: what it shows, what each action does, and how it stays in step with ops/moderate.sh. -->

# Admin Moderation Service (`adminmoderation.v1.AdminModerationService`)

The operator's side of the app's report button. People report a comment, an
expense, a group name or a profile from either app
([safety-service.md](../safety/safety-service.md)); this service lists what
is waiting and carries out the operator's decision. It backs the **Reports**
view of the admin page on the admin hostname, next to the usage overview.

It does what [ops/moderate.sh](../../../ops/moderate.sh) does, without a
shell on the server. The script still works and stays the fallback.

Contract: [adminmoderation.proto](../../../proto/adminmoderation/v1/adminmoderation.proto).
Implementation: [handler.ts](../../../apps/web/src/server/adminmoderation/handler.ts)
→ [moderation.usecase.ts](../../../apps/web/src/server/adminmoderation/usecase/moderation.usecase.ts)
→ [moderation.repo.ts](../../../apps/web/src/server/adminmoderation/repo/moderation.repo.ts).

---

## Who Can Reach It

Exactly who can reach the usage overview, checked the same way
([adminanalytics-service.md](../adminanalytics/adminanalytics-service.md)):

- It answers only on the admin hostname; on the app's hostnames it is a 404.
  `config/adminSurface.ts` lists it beside AdminAnalyticsService and nothing
  else answers there.
- Every RPC requires an `Origin` naming the admin host itself, with no
  bearer exemption (`api/connect/adminRequest.ts`, shared by both admin
  services).
- Every RPC requires a live admin session from the admin cookie. The
  allowlist is checked again on each call. An app session or a bearer token
  is never an admin credential.

There is no moderator role in the app and no way for a user account to
reach this service.

## What It Shows, and What It Never Shows

Judging a report means reading what was reported, so the queue shows those
words as written: a comment's text, an expense's description, notes and
item names, a group's name, or a person's display name. They come from the
**snapshot the server copied when the report was made**, so the operator
sees what the reporter saw even if it has been edited since.

Beside them: why it was reported (the reasons, counted), when, and the
display name of the person who wrote it, whether they are suspended, and how
much else of theirs is waiting.

Never: **who made a report**, and never an email, phone number, picture,
account id, amount, payer, member list or group. A report's own id is the
only id in the contract, and every action names a report rather than a
person. As on the usage page, this is a property of the SQL: the queue
statement pulls the words out of the snapshot field by field (a comment's
snapshot also holds its expense id, which never leaves the database), and
names the author through the same withholding rule
(`adminanalytics/repo/displayName.ts`): a name that is an email address, a
phone number or the start of the person's email comes back empty and the
page says "Name hidden". An integration test seeds reporters, contact
details, amounts and ids and searches the whole response for them.

## One Entry per Piece of Content

Several people reporting the same comment is one decision, so open reports
are grouped by what they are about. An entry shows the newest report's
snapshot and takes the newest report's id as the handle for every action,
and an action through any report about that content settles all of its open
reports. Entries are ordered longest waiting first, capped at 100; the rest
appear as these are handled.

## The Actions

| RPC | What it does | Reports |
| --- | --- | --- |
| `DismissReport` | Nothing to the content | Every open report about it becomes `dismissed` |
| `RemoveReportedContent` | Comment: deleted. Expense: description "Content removed", notes emptied, items renamed "Item". Group: renamed "Shared group". Profile: name "Member", picture and legacy payment handles removed. The feed lines and notifications that quote it say "Content removed after moderation" (see below) | Every open report about it becomes `removed` |
| `SuspendAuthor` | Sets `suspended_at` and moves `token_version` on, so every session ends at once, web and phone | Unchanged |
| `ResumeAuthor` | Clears `suspended_at` and moves `token_version` on again; the sessions the suspension ended stay ended | Unchanged |

- **Only lines that quote the content are replaced.** The feed stores each
  line as finished text, so a removal finds the lines by what they link to
  and who wrote them: for a comment, its author's comment lines on that
  expense (a comment line carries the expense's link, not the comment's, so
  the author's other comments on the same expense go too); for an expense,
  every line and notification linking to it, comments included; for a
  group, every line in its feed except comments, because every expense,
  payment, member and setting line in it names the group and a comment
  line does not, every notification linking to the group, and the
  notifications about its expenses being added, changed or deleted, whose
  body opens with the group's name (comment notifications on those
  expenses do not name it and stay); for a
  profile, everything the person did, because each line opens with their
  name, and every other line that names them. Someone else's line names a
  person only when that person is in its audience ("Ani paid Bob", "added
  Bob to Trip", "made Bob the owner", "via Bob's invite link"), so those
  are the feed lines with them in the audience and their name in the text.
  A notification naming them ("Trip · you owe Bob 600", or a third member
  told "Ani added Bob") was sent to them or shares its link with such a
  feed line, and has their name in its title or body. The name is matched
  as stored before the reset, so a line in their audience that quotes the
  same words for another reason is replaced too, and a namesake's lines
  outside it are not. The confirmation on the page says which of these
  will happen before anything does. None of it can be undone.
- **Money is never touched.** Amounts, payers, splits, settlements and
  balances are the same after every action. The integration test checks the
  ledger before and after.
- Each action is one transaction. Dismissing and removing lock every report
  about the content first, always in id order, because they close them all;
  so a double click, a second tab, or a second report about the same content
  runs after the first and sees what it did, instead of the two each holding
  one report and deadlocking. Dismissing or removing through a report that
  is no longer open is `failed_precondition` ("already handled") and
  changes nothing.
- Suspending someone already suspended, or resuming someone who is not, is
  not an error and changes nothing.
- Suspend and resume work through any report about the person, open or
  closed: the page's list of suspended accounts resumes through the newest
  one. Someone with no report left (every report about them was removed
  when the reporters deleted their accounts) is listed without a button;
  resume them by hand, see [ops/README.md](../../../ops/README.md). An
  account merged into another, or the stand-in a deleted account leaves,
  keeps its `suspended_at` but is not listed: nobody signs in through it.
- Suspending through a report about an account that was **merged into
  another**, or whose person **deleted it**, is refused: that row no longer
  signs anyone in, and suspending it would look like it worked and stop
  nobody. The page says which of the two instead of offering the button,
  so the operator does not look for a surviving account after a deletion.
  Deleting an account removes the reports about it, so a report reaches a
  deleted person only through the stand-in their content now belongs to, or
  a merge tombstone the deletion erased; both carry `deleted_at`, which is
  what `author.deleted` reads.
- Each action writes one log line: the action, the report id and the kind
  of content. Never the words, a name or an address.

### In step with ops/moderate.sh

The removal statements are those of
[moderation.sql](../../../apps/web/src/server/safety/repo/moderation.sql)
with parameters in place of psql variables, and the replacement words are
the same. `moderationParity.integration.test.ts` seeds two databases alike,
removes each kind of content through the page on one and through
`moderation.sql` on the other, and requires every table a removal can touch
to match; suspend and resume are compared the same way. It needs psql: the
Postgres container CI already runs (`MODERATION_TEST_CONTAINER`) or a local
binary (`MODERATION_TEST_PSQL`). A change to one removal that the other does
not make fails it.

Two differences are deliberate and only make sense on a page: an action
settles every open report about the same content (the script closes the one
report it was given), and a suspension of a merged or deleted account is refused (the
script applies it to the tombstone).

## Rate Limits (this service)

| RPC | Limit |
| --- | --- |
| ListReports | 30/min across all admin sessions |
| DismissReport, RemoveReportedContent, SuspendAuthor, ResumeAuthor | 30/min across all admin sessions, shared |

---

## Overview of Endpoints

1. [ListReports](#1-listreports)
2. [DismissReport](#2-dismissreport)
3. [RemoveReportedContent](#3-removereportedcontent)
4. [SuspendAuthor](#4-suspendauthor)
5. [ResumeAuthor](#5-resumeauthor)

---

### 1. ListReports

**Method:** `ListReports`
**Route:** `POST /api/connect/adminmoderation.v1.AdminModerationService/ListReports`

#### Response

| Field | Type | Description |
| --- | --- | --- |
| `generated_at` | string | RFC 3339 instant the queue was read; queue and suspended list are one snapshot |
| `reports` | ReportedContent[] | One per piece of reported content, longest waiting first, at most 100 |
| `reports_truncated` | bool | More content is waiting than `reports` lists |
| `suspended` | SuspendedAccount[] | Accounts suspended now, most recent first, at most 100 |

`ReportedContent`: `report_id`, `target_kind` (comment, expense, group,
user), `report_count`, `reasons` (reason and count, most given first),
`first_reported_at`, `last_reported_at`, `text`, `notes`, `item_names`, and
`author` (`name`, `suspended`, `active`, `open_report_count`, `deleted`).

`SuspendedAccount`: `name`, `suspended_at`, `report_id` (empty when no
report about them is left).

---

### 2. DismissReport

**Method:** `DismissReport`
**Route:** `POST /api/connect/adminmoderation.v1.AdminModerationService/DismissReport`

#### Request

| Field | Type | Description |
| --- | --- | --- |
| `report_id` | string | A report id from `ListReports` |

#### Errors

| Code | When |
| --- | --- |
| `InvalidArgument` | Not a UUID |
| `NotFound` | No such report |
| `FailedPrecondition` | The report is no longer open |

---

### 3. RemoveReportedContent

**Method:** `RemoveReportedContent`
**Route:** `POST /api/connect/adminmoderation.v1.AdminModerationService/RemoveReportedContent`

Same request and errors as `DismissReport`. See the table above for what is
removed per kind.

---

### 4. SuspendAuthor

**Method:** `SuspendAuthor`
**Route:** `POST /api/connect/adminmoderation.v1.AdminModerationService/SuspendAuthor`

Same request as `DismissReport`; the report may be open or closed.

| Code | When |
| --- | --- |
| `InvalidArgument` | Not a UUID |
| `NotFound` | No such report |
| `FailedPrecondition` | The account the report names no longer exists, was merged into another, or was deleted by its person |

---

### 5. ResumeAuthor

**Method:** `ResumeAuthor`
**Route:** `POST /api/connect/adminmoderation.v1.AdminModerationService/ResumeAuthor`

Same request as `SuspendAuthor`; refused only when the account no longer
exists.
