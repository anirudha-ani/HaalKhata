/** Composite dashboard hook: API data + net balance + settle-up sheet state. */

import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { useState } from "react";
import { useDashboardAPI } from "./useDashboardAPI";

/**
 * Combines the dashboard API data with derived state: the overall net balance
 * in cents and which counterparty (if any) the settle-up sheet is open for.
 *
 * @returns Everything from {@link useDashboardAPI} plus `netCents` (owed to
 *   you minus what you owe), `settleWith` (counterparty selected for
 *   settling, or null), and `setSettleWith` to open/close the sheet.
 */
export function useDashboard() {
  const dashboardAPI = useDashboardAPI();
  const [settleWith, setSettleWith] = useState<CounterpartyBalance | null>(null);

  const netCents =
    (dashboardAPI.balances?.owedToYouCents ?? 0) - (dashboardAPI.balances?.youOweCents ?? 0);

  return { ...dashboardAPI, netCents, settleWith, setSettleWith };
}
