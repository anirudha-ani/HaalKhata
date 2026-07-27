/** Activity-route constants. */

/** Emoji shown next to each feed entry, keyed by activity event type. */
export const TYPE_EMOJI: Record<string, string> = {
  expense_added: "🧾",
  expense_updated: "✏️",
  expense_deleted: "🗑️",
  settlement: "💸",
  member_added: "👋",
  group_created: "📒",
  comment: "💬",
};

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
