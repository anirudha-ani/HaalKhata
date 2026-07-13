/** Constants for the authed app shell (sidebar + mobile nav). */

import { Bell, Home, ScanLine, Users, UsersRound } from "lucide-react";

/** Primary navigation destinations shown in the sidebar and mobile bottom nav. */
export const NAVIGATION_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/activity", label: "Activity", icon: Bell },
];
