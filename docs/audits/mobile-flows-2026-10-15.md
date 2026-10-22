# Mobile and iPad workflow audit — 2026-10-15

Status: automated, local API and core native workflow checks completed. After
the Mac was unlocked, the dedicated iPhone and iPad simulators were exercised
with disposable local accounts. This is not a complete physical-device release
sign-off; remaining coverage is explicit below. No production accounts,
receipts, payments or infrastructure were changed.

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
- **Native accessibility:** per-person split and payer inputs have explicit
  labels. The multiple-payer switch has a name; single-payer choices expose radio
  roles and checked state. These were verified in the native accessibility tree.
- **iPad landscape editor:** an actual itemized draft exposed the right column
  extending beyond the display. The form now constrains its width and gives
  expanded columns an explicit zero basis/width with grow and shrink behavior.
  The saved draft, receipt amount controls and submit button fit after rotation;
  larger text falls back to the single-column editor without losing values.

## Evidence and coverage

| Area | Evidence from this run | Remaining device coverage |
| --- | --- | --- |
| Authentication / onboarding | Local password sign-up, onboarding, profile update, malformed/absent token denial, logout invalidation; session race regression tests | Production Apple/Google sign-in and cancellation; provider account switching (local password login, logout and relaunch passed) |
| Groups | Live create, roster, stranger denial, unrelated-member denial, ownership transfer, leave, archive/restore and archived write rejection | Native owner transfer/leave and every membership permutation; iPad create/archive/restore and archive-with-debt guard passed |
| Expenses | Live create/update across equal, exact, percent, shares and itemized modes; multiple payers; odd cents; invalid totals/participants; duplicate-operation replay | Native delete confirmation and every mode/device permutation; iPad ratio, multiple-payer and itemized saves plus iPhone equal create/edit passed |
| Editor behavior | Real native hook tests cover all five modes, multiple payers, retry/draft retention, JPY editing, camera denial, picker cancellation and receipt imports | Full VoiceOver and physical keyboard/gesture pass; native form focus, rotation, selected large-text screens and state retention checked |
| Settlements | Live amount/currency bounds, successful recording, cleared balances and replay; PostgreSQL suites cover net positions, stale digests, concurrent writes and deletion | External payment-app handoff; iPad partial JPY and iPhone net JPY settlements passed with separate currency buckets |
| Payment privacy | Live private-method creation, ownership enforcement, conditional disclosure to an owing counterparty and removal of disclosure after settlement | Native removal and external copy/open-app affordances; iPad synthetic-method create/preferred and iPhone preference edit passed |
| Friends / invitations | Live privacy-preserving request, recipient-only acceptance, group preview/accept/revoke, profile-request acceptance semantics and revoke | Signed-out native deep link, sign-in continuation, QR/share sheet and invalid-link UI |
| Comments / activity / notifications | Live comment/history/report and notification-read operations; access-denial tests; existing audience and pagination tests | Native unread badge edge cases; iPad comment submission and iPhone activity filtering/pagination passed |
| Reports / blocking | Live report authorization, block with debt, hidden comments, blocked reminders and unblock; real PostgreSQL moderation suite | Full VoiceOver pass; iPad reason selection/report acknowledgement and block/unblock with outstanding debt passed |
| Account deletion | Live wrong-confirmation rejection; existing PostgreSQL erasure/revocation/ledger-preservation tests and native balance-review tests | Final destructive confirmation was not executed; iPad balance warning and review route passed. Apple revocation still needs a disposable provider account |
| Receipt permission | Live version-bound consent, withdrawal and rejected unapproved upload; native hook tests cover first use, later scans, stale consent, offline handling and mismatch preservation | Real photo selection, camera, HEIC processing and configured AI service on a signed build |
| Phone / account merge | Live arbitrary-code rejection; existing provider, verification, merge-token and PostgreSQL concurrency suites | Real SMS delivery/verification and native merge dialogs with disposable numbers |
| Browser comparison | Disposable-account login/logout, phone-width dashboard/list/detail, JPY edit form and save action | Wider browser comparison after remaining native flows |
| iPad layout | Prior same-day simulator pass covered portrait, landscape, larger text, rail labels and keyboard/rotation draft retention | Narrow multitasking window and all device/mode permutations; normal and accessibility text expense editing and landscape repair checked natively |

The live audit used three disposable local accounts and completed **26 grouped
workflow checks** through the actual Connect HTTP API. Requests included positive
writes and negative authorization cases. This does not imply 26 complete native
UI journeys. The temporary fixture ledger remains isolated from real users.

## Native follow-up after unlock

All amounts below are synthetic ledger entries; no external payment was made.

| Device | Observed native result |
| --- | --- |
| iPhone | Password login and multi-character entry retained focus; relaunch restored Alice; sign-out returned to the login form without account data. Large-text branding stayed on one line. |
| iPhone | Created a one-off USD 10.01 expense from the friend action. Preview and saved detail agreed on 5.01/5.00 shares. Reopened it, changed category, saved, and verified the edit in activity. One-off filter returned 2 of 5 expenses. |
| iPhone | Net JPY settlement explained a 300 receivable offset against a 600 payable. Recording 300 cleared both JPY scopes and preserved the separate USD debt. Activity recorded both offsets and the payment. |
| iPhone | Activity pagination reached the end; Comments filtered to the two expected comments. Payment preference editing persisted with accessibility-medium text, with Save reachable. Account showed receipt permission off and an empty blocked list. |
| iPad | Profile name save and synthetic Venmo method creation/preference persisted. Blocking Alice with debt retained the ledger; relaunch retained the block; unblocking removed it. Account deletion opened the balance review and explicit confirmation without executing deletion. |
| iPad | Recorded a partial JPY 200 settlement against a 500 debt and observed 300 remaining. Equal, exact, percent and shares previews validated their inputs. Saved USD 12.01 with a 2:1 ratio (8.01/4.00), posted a comment, reopened under Amounts with the explanation, and saved multiple payers (7.01/5.00) without changing shares. |
| iPad | Created a JPY group with a selected friend; archived and restored it. Archived state removed Add expense. After a new debt, archive was refused with the correct 600 outstanding amount and a working See balances action. |
| iPad | Created and edited a JPY itemized expense: one 1,000 item assigned to both people, tax 100, tip 100, total 1,200 and 600 each. Draft values survived rotation. Landscape clipping was reproduced, fixed and visually checked; accessibility-medium text used a readable single column. |
| iPad | Submitted Other safety concern on a synthetic expense and saw the private-report acknowledgement. Group invite sheet displayed its QR/link and copy/share actions; no invite was sent outside the local fixtures. |

Limits of this run: Device Hub exposed native app controls but its coordinate
input intermittently failed with `noWindowsAvailable`, and some system dialogs
were absent from its accessibility tree. The Photos picker opened, but image
selection/import and OS share completion were not exercised. A keyboard-covered
settlement form accepted an overpayment draft, but its validation/submit state
was not observed through the tool; overpayment rejection is covered by the live
API checks. The iPad resize control was unavailable, so a narrow multitasking
window was not verified. These are remaining checks, not assumed passes.

## Account layout follow-up

The Account screen now groups identity and editable fields together, followed
by payment methods, profile sharing, privacy/safety, support links and account
access. Section copy is shared by native and browser; narrower layouts stack
in the same order, and wider layouts use two constrained columns. Sign-out and
delete-account controls sit at the bottom; their handlers and confirmations
are unchanged.

The revised page was visually checked on iPhone, iPad portrait/landscape and
320px/390px/1280px browser viewports, including the lower privacy/support/access
sections in the browser. This layout-only pass reran all three typecheck/lint
sets, 94 mobile tests, 505 shared tests and 636 web unit tests. The 115
PostgreSQL-dependent tests were skipped in this pass; their earlier full-run
result is recorded below.

## Automated gates

- Web typecheck/lint and **751 tests**, including real local PostgreSQL and
  operator moderation checks.
- Mobile typecheck/lint and **94 tests**, including 10 session race cases and
  11 native expense-controller workflow cases added in this pass.
- Shared typecheck/lint and **505 tests**, including the currency and split-edit
  regressions used by both renderers.
- iOS JavaScript export completed successfully with the updated shared helpers.
- Proto lint, release configuration validation and the API parity gate
  (**64 common Connect methods**).
- Repository production dependency audit: no unmitigated high/critical advisories;
  the seven existing security-patch regression fixtures passed.
  GitHub still has an open high-severity `node-forge` alert,
  `GHSA-86w9-cpqp-85rv`, with no upstream fixed version listed. The pinned local
  patch and exploit-rejection tests passed; the alert was not dismissed.

The first local database runs exceeded default timeouts during simulator boot.
The affected suites passed independently, and the complete suite was rerun with
`--maxWorkers=2 --testTimeout=30000 --hookTimeout=60000`. Repository/CI timeout
configuration was not weakened. Operator moderation is exercised by setting
`MODERATION_TEST_CONTAINER=haalkhata-db-1`; its SQL targets only the suite's
`haalkhata_safety_test` database.

## Finish before treating this as verified for release

1. Use a signed TestFlight build on physical iPhone and iPad for Apple/Google
   authentication and cancellation, real camera/photo permissions and HEIC
   processing, native sharing/deep-link sign-in continuation, payment-app handoff
   and SMS. Use disposable accounts and synthetic receipt/payment details.
2. Complete the remaining native coverage in the table, especially destructive
   confirmations on disposable fixtures, VoiceOver, narrow iPad multitasking,
   keyboard scrolling and interrupted-network recovery.
3. Repeat the same ledger fixture in mobile/tablet Safari and the signed native
   clients. API coverage and a successful bundle do not prove every UI path or
   establish that an application is free of security defects.
