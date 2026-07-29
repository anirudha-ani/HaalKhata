/** Group type options (trip/home/couple/other) and their emoji. */

/** The selectable group types, each with a machine value, display label, and emoji. */
export const GROUP_TYPES = [
  { value: "trip", label: "Trip", emoji: "✈️" },
  { value: "home", label: "Home", emoji: "🏠" },
  { value: "couple", label: "Couple", emoji: "❤️" },
  { value: "other", label: "Other", emoji: "📒" },
] as const;

/**
 * Looks up the emoji for a group type.
 *
 * @param type - The group type value (e.g. "trip", "home").
 * @returns The matching emoji, or the ledger emoji for unknown types.
 */
export function groupEmoji(type: string): string {
  return GROUP_TYPES.find((groupType) => groupType.value === type)?.emoji ?? "📒";
}

/** One balance filter button above the group list. */
export interface GroupBalanceFilterOption {
  /** Stable key held in filter state. */
  value: "all" | "owed" | "owe";
  /** Button text. */
  label: string;
}

/**
 * Filter buttons for the group list, by which way the money points.
 *
 * The two that matter are the two questions people actually open this page
 * with: who still owes me, and who am I holding up. "Settled" is deliberately
 * not offered — a group nobody owes anything on is exactly what you are
 * filtering away, so a button to show only those would be a button for
 * nothing.
 */
export const GROUP_BALANCE_FILTERS: readonly GroupBalanceFilterOption[] = [
  { value: "all", label: "All" },
  { value: "owed", label: "Owed to you" },
  { value: "owe", label: "You owe" },
];

/**
 * Whether a group belongs under the given balance filter.
 *
 * Strictly greater/less than zero, so a settled group falls under neither.
 * Using >= or <= anywhere here would put every settled group in both lists —
 * on exactly the rows the filter exists to hide.
 *
 * @param netCents - The viewer's net position in the group; positive means owed to them.
 * @param filter - Which filter button is active.
 * @returns True when the group should be listed.
 */
export function matchesBalanceFilter(
  netCents: number,
  filter: GroupBalanceFilterOption["value"],
): boolean {
  if (filter === "owed") return netCents > 0;
  if (filter === "owe") return netCents < 0;
  return true;
}

/**
 * What to say when the list is empty because something is filtering it.
 *
 * Has to name whichever control is actually hiding the rows. Reporting the
 * search term unconditionally produced `No groups match “”.` — empty quotes —
 * the moment a balance filter emptied the list on its own.
 *
 * @param query - Current search text; "" when not searching.
 * @param filter - Active balance filter.
 * @returns A sentence naming what is hiding the groups.
 */
export function noGroupsMessage(
  query: string,
  filter: GroupBalanceFilterOption["value"],
): string {
  const balancePhrase =
    filter === "owed" ? "where anyone owes you" : filter === "owe" ? "where you owe anything" : "";
  if (query && balancePhrase) return `No groups match “${query}” ${balancePhrase}.`;
  if (query) return `No groups match “${query}”.`;
  if (balancePhrase) return `No groups ${balancePhrase}.`;
  return "No groups yet.";
}
