/** Composite dashboard hook: API data + net balance + settle-up sheet state. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { useMemo, useState } from "react";
import { groupHighlights } from "@haalkhata/shared/group/highlights";
import { useDashboardAPI } from "./useDashboardAPI";

/** Who the settle-up sheet is open for, and in which currency and direction. */
export interface SettleTarget {
  /** The other person. */
  user: User;
  /** ISO 4217 code of the balance being settled. */
  currency: string;
  /** Cents outstanding in that currency; > 0 = they owe you. */
  cents: number;
}

/**
 * Combines the dashboard API data with derived state: the totals per
 * currency, the handful of groups worth surfacing, and who (and in which
 * currency) the settle-up sheet is open for.
 *
 * @returns Everything from {@link useDashboardAPI} plus `totals` (owed to
 *   you and by you, per currency — one row of cards each, never summed
 *   across currencies), `topGroups` (the groups the screen lists),
 *   `settleWith` (the person, currency and amount selected for settling, or
 *   null), and `setSettleWith` to open/close the sheet.
 */
export function useDashboard() {
  const dashboardAPI = useDashboardAPI();
  const [settleWith, setSettleWith] = useState<SettleTarget | null>(null);

  const defaultCurrency = dashboardAPI.me?.defaultCurrency || "USD";
  // A server predating `totals` sends only the default-currency scalars;
  // they read the same way as one bucket. No currency at all is shown as
  // zeros in the caller's own currency rather than as nothing.
  const totals = useMemo(() => {
    const buckets = dashboardAPI.balances?.totals ?? [];
    if (buckets.length > 0) return buckets;
    return [
      {
        currency: defaultCurrency,
        owedToYouCents: dashboardAPI.balances?.owedToYouCents ?? 0,
        youOweCents: dashboardAPI.balances?.youOweCents ?? 0,
      },
    ];
  }, [dashboardAPI.balances, defaultCurrency]);
  // Memoized because it copies the list to sort it: without this every render
  // hands the group section a new array and rerenders all of it.
  const topGroups = useMemo(() => groupHighlights(dashboardAPI.groups), [dashboardAPI.groups]);

  return { ...dashboardAPI, totals, topGroups, settleWith, setSettleWith };
}
