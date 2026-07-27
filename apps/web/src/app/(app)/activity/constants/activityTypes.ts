/** Activity-route constants: how each event kind looks, and the filter groups. */

import type { GlyphName } from "../components/ActivityPage/components/ActivityGlyph/ActivityGlyph";

/** How one kind of feed event is drawn. */
export interface ActivityLook {
  /** Which hand-drawn glyph goes in the leading tile. */
  glyph: GlyphName;
  /** Tailwind classes for the tile: background, ring and the glyph's colour. */
  tile: string;
  /** Short caption under the sentence; the row's personality lives here. */
  tag: string;
  /** Screen-reader name for the tile, since a drawing is not a label. */
  label: string;
}

/**
 * Glyph, tile and caption per event kind.
 *
 * Custom SVG rather than emoji or an off-the-shelf icon set. Emoji are drawn
 * by the OS, so the same feed looks like three different apps across
 * platforms and their fixed colours fight the tile tint; a stock icon set is
 * consistent but characterless. These are stroked in `currentColor`, so the
 * tile decides the colour, and the semantics that were broken before stay
 * fixed: money only flies away on a payment you *made*, and added vs deleted
 * differ by both tint and drawing.
 */
export const ACTIVITY_LOOK: Record<string, ActivityLook> = {
  expense_added: {
    glyph: "shockedReceipt",
    tile: "bg-brand-50 text-brand-600 ring-1 ring-brand-100",
    tag: "new damage",
    label: "Expense added",
  },
  expense_updated: {
    glyph: "sideEye",
    tile: "bg-neg-50 text-neg-700 ring-1 ring-neg-600/20",
    tag: "suspiciously edited",
    label: "Expense updated",
  },
  // Muted tile: a deleted expense is inert history and must not read like the
  // thing that created it.
  expense_deleted: {
    glyph: "skull",
    tile: "bg-card text-ink/70 ring-1 ring-line",
    tag: "gone. reduced to atoms",
    label: "Expense deleted",
  },
  member_added: {
    glyph: "buddies",
    tile: "bg-brand-50 text-brand-600 ring-1 ring-brand-100",
    tag: "one of us now",
    label: "Member added",
  },
  group_created: {
    glyph: "partyHat",
    tile: "bg-ink/8 text-ink ring-1 ring-ink/10",
    tag: "the group chat is real",
    label: "Group created",
  },
  comment: {
    glyph: "yapping",
    tile: "bg-paper text-ink-soft ring-1 ring-line",
    tag: "said something",
    label: "Comment",
  },
};

/** Fallback for an event kind this build does not know about. */
export const UNKNOWN_LOOK: ActivityLook = {
  glyph: "blank",
  tile: "bg-paper text-ink-soft ring-1 ring-line",
  tag: "",
  label: "Activity",
};

/** Money arriving: the reader was paid. */
export const INBOUND_LOOK: ActivityLook = {
  glyph: "cashGrin",
  tile: "bg-pos-50 text-pos-600 ring-1 ring-pos-600/20",
  tag: "secured the bag",
  label: "You were paid",
};

/**
 * Money leaving: the reader paid somebody.
 *
 * The winged note belongs here and only here — this is the one event where
 * money actually flies away from you, which is what the drawing depicts.
 */
export const OUTBOUND_LOOK: ActivityLook = {
  glyph: "sobbing",
  tile: "bg-paper text-ink ring-1 ring-line",
  tag: "it hurt, but it’s done",
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
 * @returns The glyph, tile classes, caption and accessible label to draw.
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
