/** Names a report reason the way the app's report dialog does. */

import { REPORT_REASONS } from "@haalkhata/shared/safety/safety";

/**
 * Looks up the words the report dialog showed for a reason, so the operator
 * reads the same choice the reporter made.
 *
 * @param reason - The reason's value, e.g. "harassment".
 * @returns Its label, or the value itself for a reason this page does not know.
 */
export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((entry) => entry.value === reason)?.label ?? reason;
}
