/** Group-detail-route constants: tab bar entries. */

import type { GroupTab } from "../components/GroupDetailScreen/hooks/useGroupDetail";

/** Tab bar entries for the expenses/balances/activity switcher. */
export const TABS: { value: GroupTab; label: string }[] = [
  { value: "expenses", label: "Expenses" },
  { value: "balances", label: "Balances" },
  { value: "activity", label: "Activity" },
];
