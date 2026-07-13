/** Constants for the authed app shell (bottom tabs + screen headers). */

import { Home, ScanLine, Users, UsersRound, type LucideIcon } from "lucide-react-native";

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

/** Bottom-tab items to the RIGHT of the floating add button. */
export const RIGHT_TAB_ITEMS: TabItem[] = [
  { name: "scan", label: "Scan", icon: ScanLine },
  { name: "friends", label: "Friends", icon: Users },
];
