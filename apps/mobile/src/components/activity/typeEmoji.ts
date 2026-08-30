/** Activity-route constants. */

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
