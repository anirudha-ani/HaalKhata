/** Which groups the dashboard lists, and in what order. */

import { leadingBucket } from "../money/balances";
import { yourGroupBuckets, type GroupSummaryBalances } from "./currencyBalances";

/** The fields the ordering reads off a group summary: the viewer's balances in it. */
export type HighlightableGroup = GroupSummaryBalances;

/** How many groups the dashboard shows before deferring to the groups page. */
export const DASHBOARD_GROUP_LIMIT = 4;

/**
 * Orders groups by how much they need attention and keeps the top few.
 *
 * Sorted by the size of your balance regardless of direction: a group you owe
 * $80 in and one you are owed $80 in are equally worth seeing, and sorting by
 * the signed number would bury every debt you owe at the bottom. A group
 * holding two currencies is placed by its larger one — a choice of order,
 * not a comparison of amounts across currencies. Settled
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
    .sort((left, right) => attention(right) - attention(left))
    .slice(0, limit);
}

/**
 * How much a group asks of the viewer, for ordering: its largest balance in
 * any one currency, sign dropped.
 *
 * @param summary - A listed group.
 * @returns Cents in that currency; 0 when settled.
 */
function attention(summary: HighlightableGroup): number {
  return Math.abs(leadingBucket(yourGroupBuckets(summary))?.cents ?? 0);
}
