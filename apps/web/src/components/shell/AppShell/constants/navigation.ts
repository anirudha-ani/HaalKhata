/** Constants for the authed app shell (sidebar + mobile nav). */

import { Bell, Handshake, Home, ReceiptText, Users } from "lucide-react";

/**
 * Primary navigation destinations shown in the desktop sidebar. The mobile
 * bottom nav uses {@link MOBILE_LEFT_NAV} / {@link MOBILE_RIGHT_NAV} instead,
 * keeping a 5-column grid of 2 left + add + 2 right.
 *
 * Scan is not among them: scanning a receipt is a way of filling in the
 * expense form, not a place to go, so it lives inside Add expense (§3j).
 *
 * Groups and Friends deliberately do NOT both use a people glyph. Every
 * lucide people icon is a circle plus shoulder arcs, so at the 20px this nav
 * renders at, `Users` and `UsersRound` were indistinguishable — the head
 * count is the only difference and it is invisible that small. `Handshake`
 * shares no primitive with them, which is what makes the pair readable at a
 * glance; it also matches what the Friends page actually is, a set of
 * pairwise balances between you and one other person (§3f).
 */
export const NAVIGATION_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/friends", label: "Friends", icon: Handshake },
  { href: "/activity", label: "Activity", icon: Bell },
];

/** Bottom-nav items to the LEFT of the floating add button. */
export const MOBILE_LEFT_NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: Users },
];

/**
 * Bottom-nav items to the RIGHT of the floating add button.
 *
 * Expenses holds the slot Activity had, and Activity goes back to the header
 * bell (which mobile keeps, unread badge and all). The trade: one-off
 * expenses live nowhere else — without this tab they are reachable only
 * through the friend they were shared with — while Activity has a second
 * mobile entry point already. Keeping five columns also keeps the add button
 * dead-center, which a sixth column would visibly break.
 */
export const MOBILE_RIGHT_NAV = [
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/friends", label: "Friends", icon: Handshake },
];
