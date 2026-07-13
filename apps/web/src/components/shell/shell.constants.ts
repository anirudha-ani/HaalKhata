/** Constants for the authed app shell (sidebar + mobile nav). */

import { Bell, Home, ScanLine, Users, UsersRound } from "lucide-react";

/**
 * Primary navigation destinations shown in the desktop sidebar. The mobile
 * bottom nav uses {@link MOBILE_LEFT_NAV} / {@link MOBILE_RIGHT_NAV} instead
 * (Activity is reachable on mobile via the header bell, so it's not in the
 * bottom nav — this keeps the 5-column grid at 2 left + add + 2 right).
 */
export const NAVIGATION_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/activity", label: "Activity", icon: Bell },
];

/** Bottom-nav items to the LEFT of the floating add button. */
export const MOBILE_LEFT_NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: UsersRound },
];

/** Bottom-nav items to the RIGHT of the floating add button. */
export const MOBILE_RIGHT_NAV = [
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/friends", label: "Friends", icon: Users },
];
