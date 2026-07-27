/** Activity-route constants: how each event kind looks, and the filter groups. */

/** How one kind of feed event is drawn. */
export interface ActivityLook {
  /** Emoji for the leading tile. */
  emoji: string;
  /** Tailwind classes for the tile: background and ring. */
  tile: string;
  /** Short caption under the sentence; the row's personality lives here. */
  tag: string;
  /** Screen-reader name for the tile, since an emoji is not a label. */
  label: string;
}

/**
 * Emoji, tile and caption per event kind.
 *
 * Emoji came back on purpose — the original problem was never that they were
 * emoji, it was that they were *wrong*: 💸 (money flying away) was drawn for
 * being paid, and flat 🧾 vs 🗑️ at 20px were two grey smudges. Both are fixed
 * here rather than avoided. Every glyph now sits on a semantic tinted tile, so
 * added-vs-deleted is carried by colour *and* mark, and 💸 appears only where
 * money genuinely leaves you.
 */
export const ACTIVITY_LOOK: Record<string, ActivityLook> = {
  expense_added: {
    emoji: "🧾",
    tile: "bg-brand-50 ring-1 ring-brand-100",
    tag: "new damage",
    label: "Expense added",
  },
  expense_updated: {
    emoji: "✏️",
    tile: "bg-neg-50 ring-1 ring-neg-600/20",
    tag: "edited, sneaky",
    label: "Expense updated",
  },
  // Muted tile: a deleted expense is inert history and must not read like the
  // thing that created it.
  expense_deleted: {
    emoji: "🪦",
    tile: "bg-card ring-1 ring-line grayscale",
    tag: "rest in peace",
    label: "Expense deleted",
  },
  member_added: {
    emoji: "🫂",
    tile: "bg-brand-50 ring-1 ring-brand-100",
    tag: "one of us",
    label: "Member added",
  },
  group_created: {
    emoji: "🎉",
    tile: "bg-ink/8 ring-1 ring-ink/10",
    tag: "the group chat is real",
    label: "Group created",
  },
  comment: {
    emoji: "💬",
    tile: "bg-paper ring-1 ring-line",
    tag: "said something",
    label: "Comment",
  },
};

/** Fallback for an event kind this build does not know about. */
export const UNKNOWN_LOOK: ActivityLook = {
  emoji: "📌",
  tile: "bg-paper ring-1 ring-line",
  tag: "",
  label: "Activity",
};

/** Money arriving: the reader was paid. */
export const INBOUND_LOOK: ActivityLook = {
  emoji: "🤑",
  tile: "bg-pos-50 ring-1 ring-pos-600/20",
  tag: "secured the bag",
  label: "You were paid",
};

/**
 * Money leaving: the reader paid somebody.
 *
 * 💸 is finally correct here — this is the one place money actually flies away
 * from you, which is exactly what the glyph depicts.
 */
export const OUTBOUND_LOOK: ActivityLook = {
  emoji: "💸",
  tile: "bg-paper ring-1 ring-line",
  tag: "paid up",
  label: "You paid",
};

/**
 * Picks the look for one event.
 *
 * Settlements are the reason this is a function rather than a lookup: the
 * same stored row is money in for one reader and money out for the other, so
 * a single stored glyph would be wrong for one of them.
 *
 * @param type - Event kind from the server.
 * @param inbound - Whether this event moved money toward the reader.
 * @returns The emoji, tile classes, caption and accessible label to draw.
 */
export function activityLook(type: string, inbound: boolean): ActivityLook {
  if (type === "settlement") return inbound ? INBOUND_LOOK : OUTBOUND_LOOK;
  return ACTIVITY_LOOK[type] ?? UNKNOWN_LOOK;
}

/** Which grouping of event types the feed is currently showing. */
export type ActivityFilter = "all" | "expenses" | "payments" | "comments" | "groups";

/** One filter button: a label and the raw event types it admits. */
interface ActivityFilterOption {
  /** Filter key held in page state. */
  value: ActivityFilter;
  /** Button text. */
  label: string;
  /** Event types this filter admits; empty means every type. */
  types: readonly string[];
}

/**
 * Filter buttons above the feed. Each groups the raw event types a person
 * thinks of as one thing — nobody looks for "expense_updated", they look for
 * expenses.
 */
export const ACTIVITY_FILTERS: readonly ActivityFilterOption[] = [
  { value: "all", label: "All", types: [] },
  {
    value: "expenses",
    label: "Expenses",
    types: ["expense_added", "expense_updated", "expense_deleted"],
  },
  { value: "payments", label: "Payments", types: ["settlement"] },
  { value: "comments", label: "Comments", types: ["comment"] },
  { value: "groups", label: "Groups", types: ["group_created", "member_added"] },
];
