/** Says why a piece of content was reported, in one line. */

import type { ReasonCount } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";
import { reasonLabel } from "./reasonLabel";

/**
 * Joins the reasons given into one line, in the order the server ranked
 * them, with a count beside any reason given more than once.
 *
 * @param reasons - The reasons and how often each was given.
 * @returns e.g. "Spam or fraud ×2 · Harassment or threats".
 */
export function reasonsLine(reasons: readonly Pick<ReasonCount, "reason" | "count">[]): string {
  return reasons
    .map((entry) => `${reasonLabel(entry.reason)}${entry.count > 1 ? ` ×${entry.count}` : ""}`)
    .join(" · ");
}
