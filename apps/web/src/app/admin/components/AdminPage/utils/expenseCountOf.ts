/** Counts the expenses one person added, of one split type or of any. */

import type { UserUsage } from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";
import { ALL_SPLIT_TYPES } from "../constants/adminPage";

/**
 * How many expenses a person added, of one split type or of any.
 *
 * @param person - One person's usage.
 * @param splitType - A split type key, or {@link ALL_SPLIT_TYPES}.
 * @returns The count.
 */
export function expenseCountOf(person: UserUsage, splitType: string): number {
  return person.expensesBySplitType.reduce(
    (total, entry) =>
      splitType === ALL_SPLIT_TYPES || entry.splitType === splitType ? total + entry.count : total,
    0,
  );
}
