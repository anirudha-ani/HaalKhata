/** Which groups the dashboard lists, and in what order. */

/** The one field the ordering reads off a group summary. */
export interface HighlightableGroup {
  /** The viewer's net position in the group; positive means owed to them. */
  yourNetCents: number;
}

/** How many groups the dashboard shows before deferring to the groups page. */
export const DASHBOARD_GROUP_LIMIT = 4;

/**
 * Orders groups by how much they need attention and keeps the top few.
 *
 * Sorted by the size of your balance regardless of direction: a group you owe
 * $80 in and one you are owed $80 in are equally worth seeing, and sorting by
 * the signed number would bury every debt you owe at the bottom. Settled
 * groups fall to the end on their own, being zero, so they are shown only
 * while there is room rather than filtered out — the dashboard says how you
 * stand, and "nothing outstanding" is part of that.
 *
 * Structurally typed so the generated GroupSummary never has to be imported
 * here — this package is shared by both apps and stays free of the proto
 * package.
 *
 * @param summaries - Group summaries as the server returned them.
 * @param limit - Most groups to return.
 * @returns At most `limit` summaries, most demanding first.
 */
export function groupHighlights<Summary extends HighlightableGroup>(
  summaries: readonly Summary[],
  limit: number = DASHBOARD_GROUP_LIMIT,
): Summary[] {
  return [...summaries]
    .sort((left, right) => Math.abs(right.yourNetCents) - Math.abs(left.yourNetCents))
    .slice(0, limit);
}
