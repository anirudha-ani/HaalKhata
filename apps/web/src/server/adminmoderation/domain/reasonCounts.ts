/** Turns the reasons given in a set of reports into counts, most given first. */

import { REPORT_REASONS } from "@haalkhata/shared/safety/safety";

/**
 * Counts how often each reason was given.
 *
 * Ties keep the order the report dialog offers the reasons in, so the same
 * mix of reasons always reads the same way.
 *
 * @param reasons - One reason per report.
 * @returns Each reason given, with its count, most given first.
 */
export function rankReasons(reasons: readonly string[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const dialogOrder = REPORT_REASONS.map((entry) => entry.value as string);
  /** @returns Where the dialog lists a reason; unknown reasons sort last. */
  const position = (reason: string) => {
    const index = dialogOrder.indexOf(reason);
    return index === -1 ? dialogOrder.length : index;
  };
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((first, second) => second.count - first.count || position(first.reason) - position(second.reason));
}
