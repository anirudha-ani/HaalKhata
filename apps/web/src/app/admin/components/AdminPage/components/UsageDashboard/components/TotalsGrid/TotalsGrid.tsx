"use client";
/** Totals grid: the product-wide headline counts as stat tiles. */

import type { UsageTotals } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { StatTile } from "@/components/charts/StatTile/StatTile";

/**
 * Renders the headline counts. Each is a single number, so each is a tile
 * rather than a bar: a chart of one value says nothing the number does not.
 * Where a count has a part worth knowing (how many were invited but never
 * joined, how many expenses were later deleted or payments removed, how many people the saved
 * payment methods belong to), the tile says so beneath it.
 *
 * @param props - Component props.
 * @returns The grid.
 */
export function TotalsGrid({
  totals,
}: {
  /** The product-wide totals. */
  totals: UsageTotals;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile
        label="People"
        value={totals.registeredUserCount.toLocaleString()}
        hint={`${totals.invitedUserCount.toLocaleString()} invited, not joined`}
      />
      <StatTile
        label="Active, 7 days"
        value={totals.weeklyActiveUserCount.toLocaleString()}
        hint={`${totals.monthlyActiveUserCount.toLocaleString()} in 30 days`}
      />
      <StatTile
        label="Expenses added"
        value={totals.expenseCount.toLocaleString()}
        hint={`${totals.deletedExpenseCount.toLocaleString()} later deleted`}
      />
      <StatTile
        label="Payments recorded"
        value={totals.paymentCount.toLocaleString()}
        hint={`${totals.deletedPaymentCount.toLocaleString()} later removed`}
      />
      <StatTile
        label="Receipt scans"
        value={totals.receiptScanCount.toLocaleString()}
        hint={`${totals.parsedReceiptScanCount.toLocaleString()} read successfully`}
      />
      <StatTile
        label="Payment methods"
        value={totals.paymentMethodCount.toLocaleString()}
        hint={`saved by ${totals.paymentMethodUserCount.toLocaleString()} ${
          totals.paymentMethodUserCount === 1 ? "person" : "people"
        }`}
      />
      <StatTile label="Groups" value={totals.groupCount.toLocaleString()} />
      <StatTile label="Comments" value={totals.commentCount.toLocaleString()} />
    </div>
  );
}
