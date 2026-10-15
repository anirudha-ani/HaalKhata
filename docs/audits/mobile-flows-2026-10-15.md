# Mobile and iPad workflow audit — 2026-10-15

Status: automated and local API checks completed; the complete hands-on native
workflow pass remains pending. The Mac locked during this run and Device Hub
could not expose an interactive simulator window. This is not a release sign-off.
No production accounts, receipts, payments or infrastructure were changed.

## Fixes from this pass

- **Session isolation:** delayed 401s and renewals from an earlier session no
  longer clear or replace a new login. Keychain writes are ordered; a pending
  hydration read cannot restore an account after login or logout. Cache clearing
  starts synchronously with session clearing on a current-session 401.
- **Saved expense currency:** both editors use the saved one-off currency after
  a profile-default change. Input parsing, preview and submission use the same
  currency. Opening a JPY expense under a USD profile keeps 1,001 yen as 1,001 yen.
- **Equal-split wording:** both editors use shared currency formatting, including
  zero- and three-decimal currencies, and show the actual range when remainder
  units make the shares unequal (for example, ¥500–¥501).
- **Percentage/share edits:** the current persistence model stores allocated
  amounts, not original ratios. These edits previously reopened with blank,
  invalid inputs. Both editors now load the saved amounts under Amounts and
  visibly explain the choice. Saving this form uses an exact split and preserves
  the amounts; choosing Percent or Shares starts a new explicit ratio split.
- **Receipt currency mismatch:** both clients refuse to import a receipt detected
  in a different currency. The draft stays intact and the user can enter values
  manually in the expense currency. No exchange rate or conversion is invented.
- **Native accessibility:** per-person split-value inputs have explicit labels.

## Evidence and coverage

| Area | Evidence from this run | Remaining device coverage |
| --- | --- | --- |
| Authentication / onboarding | Local password sign-up, onboarding, profile update, malformed/absent token denial, logout invalidation; session race regression tests | Production Apple/Google sign-in and cancellation; native account switching and relaunch |
| Groups | Live create, roster, stranger denial, unrelated-member denial, ownership transfer, leave, archive/restore and archived write rejection | Execute each UI action on iPhone/iPad |
| Expenses | Live create/update across equal, exact, percent, shares and itemized modes; multiple payers; odd cents; invalid totals/participants; duplicate-operation replay | Native create/edit/delete and navigation for each mode |
| Editor behavior | Real native hook tests cover all five modes, multiple payers, retry/draft retention, JPY editing, camera denial, picker cancellation and receipt imports | Full native gestures, keyboard and assistive-technology pass |
| Settlements | Live amount/currency bounds, successful recording, cleared balances and replay; PostgreSQL suites cover net positions, stale digests, concurrent writes and deletion | Native settlement sheets, partial/net/multi-currency payments and external payment-app handoff |
| Payment privacy | Live private-method creation, ownership enforcement, conditional disclosure to an owing counterparty and removal of disclosure after settlement | Native create/edit/preferred/delete controls; copy/open-app affordances |
| Friends / invitations | Live privacy-preserving request, recipient-only acceptance, group preview/accept/revoke, profile-request acceptance semantics and revoke | Signed-out native deep link, sign-in continuation, QR/share sheet and invalid-link UI |
| Comments / activity / notifications | Live comment/history/report and notification-read operations; access-denial tests; existing audience and pagination tests | Native filtering, pagination, unread state and comment composer |
| Reports / blocking | Live report authorization, block with debt, hidden comments, blocked reminders and unblock; real PostgreSQL moderation suite | Native report reasons, confirmation and blocked-account management |
| Account deletion | Live wrong-confirmation rejection; existing PostgreSQL erasure/revocation/ledger-preservation tests and native balance-review tests | Native final confirmation; real Apple revocation on a disposable provider account |
| Receipt permission | Live version-bound consent, withdrawal and rejected unapproved upload; native hook tests cover first use, later scans, stale consent, offline handling and mismatch preservation | Real photo selection, camera, HEIC processing and configured AI service on a signed build |
| Phone / account merge | Live arbitrary-code rejection; existing provider, verification, merge-token and PostgreSQL concurrency suites | Real SMS delivery/verification and native merge dialogs with disposable numbers |
| Browser comparison | Disposable-account login/logout, phone-width dashboard/list/detail, JPY edit form and save action | Wider browser comparison after remaining native flows |
| iPad layout | Prior same-day simulator pass covered portrait, landscape, larger text, rail labels and keyboard/rotation draft retention | Repeat all affected functional flows, including multitasking, after these changes |

The live audit used three disposable local accounts and completed **26 grouped
workflow checks** through the actual Connect HTTP API. Requests included positive
writes and negative authorization cases. This does not imply 26 complete native
UI journeys. The temporary fixture ledger remains isolated from real users.

## Automated gates

- Web typecheck/lint and **751 tests**, including real local PostgreSQL and
  operator moderation checks.
- Mobile typecheck/lint and **94 tests**, including 10 session race cases and
  11 native expense-controller workflow cases added in this pass.
- Shared typecheck/lint and **505 tests**, including the currency and split-edit
  regressions used by both renderers.
- Proto lint, release configuration validation and the API parity gate
  (**64 common Connect methods**).
- Repository production dependency audit: no unmitigated high/critical advisories;
  the seven existing security-patch regression fixtures passed.

The first local database runs exceeded default timeouts during simulator boot.
The affected suites passed independently, and the complete suite was rerun with
`--maxWorkers=2 --testTimeout=30000 --hookTimeout=60000`. Repository/CI timeout
configuration was not weakened. Operator moderation is exercised by setting
`MODERATION_TEST_CONTAINER=haalkhata-db-1`; its SQL targets only the suite's
`haalkhata_safety_test` database.

## Finish before treating this as verified for release

1. Unlock the Mac and expose Device Hub. Reuse the dedicated QA simulators and
   disposable accounts; leave the user's original simulator and dev servers alone.
2. Complete every native UI row above on iPhone and iPad, including normal/large
   text, portrait/landscape, a narrow iPad window and interrupted network access.
3. Repeat provider/device integrations in a signed TestFlight build on physical
   devices: Apple/Google, real camera/photo permissions, native share/deep links,
   payment-app handoff and SMS. Do not use real financial or private receipt data
   for these checks.
4. Record observed outcomes and fix any remaining failures. API method coverage,
   mocked native hosts and a successful JavaScript bundle are supporting checks,
   not substitutes for the native device flows.
