/** Activity-route constants: how each event kind looks, and the filter groups. */

import {
  ArrowDownLeft,
  ArrowUpRight,
  MessageSquare,
  PencilLine,
  Receipt,
  Trash2,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/** How one kind of feed event is drawn. */
export interface ActivityLook {
  /** Icon for the leading tile. */
  icon: LucideIcon;
  /** Tailwind classes for the tile: background, border and icon colour. */
  tile: string;
}

/**
 * Icon and colour per event kind.
 *
 * Colour encodes the family and the glyph encodes the action, so nothing
 * depends on colour alone: an expense being added and the same expense being
 * deleted differ by both a filled brand tile vs a muted outlined one *and* by
 * receipt vs bin. Emoji were dropped because 🧾 and 🗑️ are both mid-grey at
 * this size — they read as the same mark — and because emoji render
 * differently on every platform, so none of it was controllable.
 */
export const ACTIVITY_LOOK: Record<string, ActivityLook> = {
  expense_added: { icon: Receipt, tile: "bg-brand-50 text-brand-600 ring-1 ring-brand-100" },
  expense_updated: { icon: PencilLine, tile: "bg-neg-50 text-neg-700 ring-1 ring-neg-600/20" },
  // Muted and outlined rather than tinted: a deleted expense is inert history,
  // and it must not look like the thing that created it.
  expense_deleted: { icon: Trash2, tile: "bg-card text-ink-soft ring-1 ring-line" },
  member_added: { icon: UserPlus, tile: "bg-brand-50 text-brand-600 ring-1 ring-brand-100" },
  group_created: { icon: UsersRound, tile: "bg-ink/8 text-ink ring-1 ring-ink/10" },
  comment: { icon: MessageSquare, tile: "bg-paper text-ink-soft ring-1 ring-line" },
};

/** Fallback for an event kind this build does not know about. */
export const UNKNOWN_LOOK: ActivityLook = {
  icon: Receipt,
  tile: "bg-paper text-ink-soft ring-1 ring-line",
};

/** Money arriving: the reader was paid. */
export const INBOUND_LOOK: ActivityLook = {
  icon: ArrowDownLeft,
  tile: "bg-pos-50 text-pos-600 ring-1 ring-pos-600/20",
};

/** Money leaving: the reader paid somebody. Neutral — settling a debt is not a fault. */
export const OUTBOUND_LOOK: ActivityLook = {
  icon: ArrowUpRight,
  tile: "bg-paper text-ink ring-1 ring-line",
};

/**
 * Picks the look for one event.
 *
 * Settlements are the reason this is a function rather than a lookup: the
 * same stored row is money in for one reader and money out for the other, so
 * a single stored icon would be wrong for one of them.
 *
 * @param type - Event kind from the server.
 * @param inbound - Whether this event moved money toward the reader.
 * @returns The icon and tile classes to draw.
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
