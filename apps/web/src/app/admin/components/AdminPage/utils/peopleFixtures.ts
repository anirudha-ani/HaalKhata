/** Test fixtures for the admin people table helpers. */

import { create } from "@bufbuild/protobuf";
import {
  UserUsageSchema,
  type UserUsage,
} from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";

/**
 * Builds one person's usage.
 *
 * @param name - Display name.
 * @param joinedOn - "YYYY-MM-DD".
 * @param bySplitType - Expenses added, keyed by split type.
 * @param paymentCount - Payments recorded.
 * @param receiptScanCount - Receipts scanned.
 * @returns The usage message.
 */
export function personUsage(
  name: string,
  joinedOn: string,
  bySplitType: Record<string, number> = {},
  paymentCount = 0,
  receiptScanCount = 0,
): UserUsage {
  return create(UserUsageSchema, {
    name,
    joinedOn,
    expensesBySplitType: Object.entries(bySplitType).map(([splitType, count]) => ({
      splitType,
      count,
    })),
    paymentCount,
    receiptScanCount,
  });
}

/** Someone with history of every kind. */
export const ANIKA = personUsage("Anika Rahman", "2026-09-01", { equal: 4, itemized: 2 }, 3, 5);

/** Someone with a little history. */
export const RIFAT = personUsage("Rifat Khan", "2026-10-02", { equal: 1 }, 0, 1);

/** Someone who has joined and done nothing yet. */
export const LATECOMER = personUsage("Late Comer", "2026-10-09");

/** The three, newest first, as the overview lists them. */
export const PEOPLE: readonly UserUsage[] = [LATECOMER, RIFAT, ANIKA];
