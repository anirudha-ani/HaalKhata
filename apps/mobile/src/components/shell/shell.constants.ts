/** Constants for the authed app shell (bottom tabs + screen headers). */

import { Home, ReceiptText, Users, UsersRound, type LucideIcon } from "lucide-react-native";

/** One bottom-tab destination: the route file name, its label, and its icon. */
export interface TabItem {
  /** Route file name inside app/(app)/(tabs). */
  name: string;
  /** Short label rendered under the icon. */
  label: string;
  /** Icon component rendered above the label. */
  icon: LucideIcon;
}

/** Bottom-tab items to the LEFT of the floating add button. */
export const LEFT_TAB_ITEMS: TabItem[] = [
  { name: "dashboard", label: "Home", icon: Home },
  { name: "groups", label: "Groups", icon: UsersRound },
];

/**
 * Bottom-tab items to the RIGHT of the floating add button.
 *
 * Expenses holds the slot Scan had, matching the web's bottom nav: one-off
 * expenses live nowhere else — without this tab they are reachable only
 * through the friend they were shared with — while scanning a receipt is a
 * way of filling in the expense form, not a place to go.
 */
export const RIGHT_TAB_ITEMS: TabItem[] = [
  { name: "expenses", label: "Expenses", icon: ReceiptText },
  { name: "friends", label: "Friends", icon: Users },
];

/** Viewport width at which persistent tablet navigation replaces bottom tabs. */
export const TABLET_BREAKPOINT = 768;

/** Viewport width at which screens have room for side-by-side content columns. */
export const EXPANDED_LAYOUT_BREAKPOINT = 1024;

/** Maximum readable width for the standard screen canvas. */
export const SCREEN_CONTENT_MAX_WIDTH = 1180;

/** Maximum width for focused authentication and onboarding forms. */
export const FOCUSED_CONTENT_MAX_WIDTH = 520;

/** Maximum width for a tablet dialog presented by the shared Sheet component. */
export const TABLET_SHEET_MAX_WIDTH = 640;

/** Width of the persistent navigation rail on tablet-sized viewports. */
export const TABLET_NAVIGATION_WIDTH = 104;
