/** Activity feed filter groups: the buttons above the feed and the event types each admits. */

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
  { value: "payments", label: "Payments", types: ["settlement", "settlement_deleted"] },
  { value: "comments", label: "Comments", types: ["comment"] },
  {
    value: "groups",
    label: "Groups",
    types: ["group_created", "member_added", "ownership_transferred"],
  },
];
