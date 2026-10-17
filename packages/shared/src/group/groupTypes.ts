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

/**
 * Looks up the display label for a group type. The label is spelled out
 * rather than produced by capitalising the value on screen: iOS lowercases
 * everything after the first letter of each word when it capitalises, which
 * turned "trip · USD" into "Trip · Usd".
 *
 * @param type - The group type value (e.g. "trip", "home").
 * @returns The matching label, or the value with its first letter raised for
 *   a type this build does not know.
 */
export function groupTypeLabel(type: string): string {
  return (
    GROUP_TYPES.find((groupType) => groupType.value === type)?.label ??
    type.charAt(0).toUpperCase() + type.slice(1)
  );
}
