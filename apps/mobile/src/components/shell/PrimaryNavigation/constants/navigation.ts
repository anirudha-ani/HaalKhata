/** Constants for the authed app shell (bottom tabs + screen headers). */

import { Home, Plus, ReceiptText, Users, UsersRound, type LucideIcon } from "lucide-react-native";

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

/** Add-expense destination rendered as a regular item in the tablet rail. */
export const ADD_TAB_ITEM: TabItem = { name: "add", label: "Add", icon: Plus };

/** Width of the persistent navigation rail on tablet-sized viewports. */
export const TABLET_NAVIGATION_WIDTH = 104;
