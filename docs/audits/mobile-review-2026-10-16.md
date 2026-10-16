# Mobile branch review follow-up — 2026-10-16

Reviewed the 15 supplied findings against `codex/fix-mobile-dev-startup`. All
identified actionable defects or cleanup; findings 2 and 15 need the qualifications
below. Changes are grouped into expense correctness, native startup, and layout.

## Findings and fixes

| # | Assessment | Resolution |
| --- | --- | --- |
| 1 | Confirmed: ambiguous receipts and the development mock became USD. | Both clients send the form currency. The server uses it when the receipt has no supported, confidently identified currency. The extraction prompt treats bare `$` and `¥` as ambiguous. Genuine currency mismatches still preserve the draft and refuse import. |
| 2 | Confirmed metadata-save regression; the initial exact-amount fallback was deliberate. | Original percentages/weights were never stored and cannot reliably be recovered from rounded allocations. The editor still shows the saved amounts, but unchanged allocations retain the stored percent/shares mode. A shared comparison checks total, currency, group, participants and amounts; the server repeats the check against the locked current expense. Changed allocations require an explicit new split. |
| 3 | Confirmed: fixed hundredths are wrong for zero- and three-decimal currencies. | Provider output now uses printed decimal-string major units. Server normalization converts these to the currency's integer minor units with integer arithmetic, rounding and bounds. Legacy `*_cents` provider fields are interpreted as fixed hundredths and rescaled. USD/INR/JPY/KWD and mock cases are covered. |
| 4 | Confirmed: early return discarded the normalized HEIC preview. | Retain the server JPEG before currency validation. A rejected import still shows the photo and permits retry; it does not show the auto-itemized badge. The browser test renders the real receipt panel. |
| 5 | Confirmed: multiple adb targets could produce no installation identity. | Select one target before the build. With multiple targets, fail early with `ANDROID_SERIAL=<serial> ./dev.sh --mobile-android`. Build once, then install, identify and launch explicitly on that serial. |
| 6 | Confirmed: symlink path comparison could skip the CLI entirely. | Compare canonical entrypoint paths. A subprocess regression invokes the CLI through a symlinked checkout. |
| 7 | Confirmed: post-build-only fingerprints could certify unbuilt changes. | Capture the fingerprint after native preparation and before compilation. Recheck after installation; refuse the record if the inputs changed. Failed preparation/build/install/record steps stop startup. |
| 8 | Confirmed: one-line totals could hide digits. | Dashboard and Friends use one native balance-card component. Amounts never ellipsize; a wrapped amount expands the card to a full row. Larger text can still wrap at full width. |
| 9 | Confirmed: the 280-point minimum displaced phone actions. | Give the person link the remaining row width, place phone amounts below the name, and deliberately stack actions at large text sizes. |
| 10 | Confirmed: the settlement total inherited a vertical detail layout. | Give the total its own horizontal, wrapping layout. Detailed scope rows retain their separate layout. |
| 11 | Confirmed: tablet categories had a nested vertical ScrollView. | Use an ordinary wrapping View on tablet. Phones retain the horizontal category scroller. |
| 12 | Confirmed: the saved-amount notice outlived the saved allocations. | Show the notice only while preservation is actually eligible. Group/person changes that clear amounts also clear the notice on both clients. |
| 13 | Confirmed: every Text subscribed to window dimensions. | One provider publishes only font scale. Text consumes that context; width-only changes do not notify every text node. Tests cover 100 text nodes, ref updates, and retained input identity/focus. |
| 14 | Confirmed cleanup. | Remove the empty React Native import. |
| 15 | Confirmed cleanup, with eight inline scaled widths found rather than fourteen. | Derive scaled widths from their stylesheet definitions. Consolidate duplicate balance-card presentation into the shared native component. |

## Compatibility and verification

- No database migration or change to stored allocations. Two optional protobuf
  request fields were added: `ParseReceiptRequest.currency` and
  `UpdateExpenseRequest.preserve_split_type`. Regenerate with `pnpm gen`; generated
  files remain ignored. Deploy the server before distributing clients that rely
  on these fields. Older clients retain their old behavior.
- Web, mobile and shared typecheck/lint pass; proto lint passes.
- Web: **776 passed, 1 skipped**, including real PostgreSQL tests in isolated test
  databases. The skipped case needs a separate operator moderation container.
- Mobile: **97 passed**. Shared: **515 passed**. Environment/startup: **53 passed**,
  including target selection, symlink entrypoint, compile-time input changes and
  failures that must not record a compatible build.
- Browser regressions cover unchanged ratio edits, cleared notices, operation-ID
  retries, and a rejected HEIC import retaining both the image and manual draft.
  Server regressions cover preservation, a concurrently changed locked expense,
  and intentional conversion to an exact split.
- Native visual check used the real balance and friend components in an isolated
  temporary fixture at 390-point phone width, normal and accessibility-medium
  text. Large JPY/KWD totals retain every digit; default-size friend actions stay
  beside the person, while larger text gets a separate action row. The fixture
  was removed and the QA phone's text size restored.
- The attempted iPad gesture recheck was blocked by Device Hub's unavailable
  accessibility window and screen-capture failure. The tablet category/settlement
  changes were inspected in code, but the gesture/layout behavior was not newly
  verified on iPad. The QA iPad was returned to its previous shutdown state.
- No fresh Gradle/Xcode compilation or live AI-provider request was run for this
  follow-up. Native startup ordering is covered by the real shell functions with
  external build tools stubbed; installed iOS clients were used for visual checks.
  Existing broader device-flow coverage remains in
  [the preceding audit](mobile-flows-2026-10-15.md).
