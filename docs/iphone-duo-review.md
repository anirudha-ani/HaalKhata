# iPhone Duo review — 2026-11-04

Review of PR 85 (`feat/iphone-duo-support`), starting at `3801b0f1` and
including the layout fixes through `ce403d5e`. The running JavaScript came
from an isolated checkout, served by Metro on port 8082 against the existing
local development backend on port 3000. The simulator used the installed
development client, Xcode 27.2 and the iPhone Duo iOS 27.2 runtime.

## Native checks

The signed-in checks used the disposable Duo Tester account and its seeded
ledger. No expense, payment, account setting or provider request was submitted.
The account was signed out at the end to inspect the welcome screen.

| Surface | Checks performed |
| --- | --- |
| Navigation and safe areas | Inner display upright and wide, closed cover in both orientations, and half-open pose; rail versus bottom tabs; content clear of the status strip |
| Home, Groups and Friends | Balance cards, group cards, friend rows at default and accessibility text sizes; group Expenses/Balances and overflow menu |
| Expenses | Cover list and detail at larger text; description draft retained through rotation, closing and half-opening, including keyboard use |
| Payment dialog | Reproduced the disappearing form when the keyboard and large text left too little room for pinned controls; verified the branch's scrolling header/actions fix, retained note, and reachable final action; cancelled without recording |
| Account | Profile and payment-method sheet in the short landscape cover window; cancelled without saving |
| Activity and Insights | Feed and Insights, full-width cards upright, paired cards wide, and live Dynamic Type changes |

At accessibility text sizes, the paired Insights cards reduced different group
names to the same `[Demo]…` label. Cards now occupy full rows when
`isLargeText` is true. Native verification showed complete seeded group names
and person names at that size, with amounts and counts still visible.

To repeat: follow [mobile-layout-verification.md](mobile-layout-verification.md)
to start the app and seed a local account. Open Activity → Insights with the
Duo open and held wide, increase DeviceHub's Text Size to an accessibility
size, and scroll through the category, people, group and split-method cards.
Restore the default text size afterward. These layout checks need no provider
credentials; real provider configuration remains documented in
[local-auth.md](local-auth.md).

## Sign-in across layout changes

Rotating the open Duo from upright to wide dismissed an open password dialog
and discarded its draft. The phone and wide welcome layouts previously
rendered different trees, which also remounted the provider buttons and story
pager. They now keep one tree and change its styles. Larger text uses the
stacked layout, and the development button wraps before squeezing the brand.

On the Duo, an unsent `duo-review` draft survived closing, reopening and a live
text-size change. Typing `-kept` after folding continued in the same field.
The welcome screen was also checked on iPad mini (A20 Pro), iPadOS 27.2, in
portrait and landscape at default and accessibility text sizes. All simulated
text-size settings were restored afterward.

To repeat, sign out of a disposable local account, open Password (dev), type
an identifier without submitting, and rotate/fold across the wide-layout
boundary. The dialog must remain open with the same draft and focus. Change
Text Size while it is open and repeat. The component regression test also
checks that a pending provider control and the current story step retain their
state; it does not perform or replace provider authentication.

## Automated verification

- Web typecheck and lint passed; web tests passed with `pnpm test --maxWorkers=4`
  (1,661 passed, 3 skipped). Limiting workers avoided database integration
  timeouts from competing simulator/build processes.
- Mobile typecheck, lint and all 279 tests passed.
- Connect parity and protobuf lint passed.

This review does not establish production OAuth, physical-device gestures or
haptics, Android execution, external payment handoffs, SMS, push, or camera/AI
receipt behavior. Those flows were outside this layout pass.
