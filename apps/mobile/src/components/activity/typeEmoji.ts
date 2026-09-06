/** Activity feed constants: the emoji tile per event kind. */

/** Emoji shown next to each feed entry, keyed by activity event type. */
export const TYPE_EMOJI: Record<string, string> = {
  expense_added: "🧾",
  expense_updated: "✏️",
  expense_deleted: "🗑️",
  settlement: "💸",
  settlement_deleted: "↩️",
  member_added: "👋",
  group_created: "📒",
  ownership_transferred: "👑",
  comment: "💬",
};

/** Money arriving: the reader was paid. */
export const INBOUND_EMOJI = "🤑";

/** Fallback for an event kind this build does not know about. */
export const UNKNOWN_EMOJI = "📌";

/**
 * Picks the emoji for one event.
 *
 * Settlements are the reason this is a function rather than a lookup: the
 * same stored row is money in for one reader and money out for the other,
 * so a single stored tile would be wrong for one of them — money only flies
 * away on a payment you *made*.
 *
 * @param type - Event kind from the server.
 * @param inbound - Whether this event moved money toward the reader.
 * @returns The emoji to draw in the row's tile.
 */
export function activityEmoji(type: string, inbound: boolean): string {
  if (type === "settlement" && inbound) return INBOUND_EMOJI;
  return TYPE_EMOJI[type] ?? UNKNOWN_EMOJI;
}
