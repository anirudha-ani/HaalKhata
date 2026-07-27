/** Constants for the authed app shell (sidebar + mobile nav). */

import { Bell, Home, Users, UsersRound } from "lucide-react";

/**
 * Primary navigation destinations shown in the desktop sidebar. The mobile
 * bottom nav uses {@link MOBILE_LEFT_NAV} / {@link MOBILE_RIGHT_NAV} instead,
 * keeping a 5-column grid of 2 left + add + 2 right.
 *
 * Scan is not among them: scanning a receipt is a way of filling in the
 * expense form, not a place to go, so it lives inside Add expense (§3j).
 */
export const NAVIGATION_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/activity", label: "Activity", icon: Bell },
];

/** Bottom-nav items to the LEFT of the floating add button. */
export const MOBILE_LEFT_NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: UsersRound },
];

/**
 * Bottom-nav items to the RIGHT of the floating add button. Activity took the
 * slot Scan vacated, so it is no longer reachable only via the header bell.
 */
export const MOBILE_RIGHT_NAV = [
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/activity", label: "Activity", icon: Bell },
];
