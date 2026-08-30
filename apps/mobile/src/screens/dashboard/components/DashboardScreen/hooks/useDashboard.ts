/** Composite dashboard hook: API data + net balance + settle-up sheet state. */

import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { useMemo, useState } from "react";
import { groupHighlights } from "@haalkhata/shared/group/highlights";
import { useDashboardAPI } from "./useDashboardAPI";

/**
 * Combines the dashboard API data with derived state: the overall net balance
 * in cents, the handful of groups worth surfacing, and which counterparty
 * (if any) the settle-up sheet is open for.
 *
 * @returns Everything from {@link useDashboardAPI} plus `netCents` (owed to
 *   you minus what you owe), `topGroups` (the groups the screen lists),
 *   `settleWith` (counterparty selected for settling, or null), and
 *   `setSettleWith` to open/close the sheet.
 */
export function useDashboard() {
  const dashboardAPI = useDashboardAPI();
  const [settleWith, setSettleWith] = useState<CounterpartyBalance | null>(null);

  const netCents =
    (dashboardAPI.balances?.owedToYouCents ?? 0) - (dashboardAPI.balances?.youOweCents ?? 0);
  // Memoized because it copies the list to sort it: without this every render
  // hands the group section a new array and rerenders all of it.
  const topGroups = useMemo(() => groupHighlights(dashboardAPI.groups), [dashboardAPI.groups]);

  return { ...dashboardAPI, netCents, topGroups, settleWith, setSettleWith };
}
