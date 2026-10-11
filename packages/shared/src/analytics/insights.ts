/** Pure wording and view state for the personal insights dashboard both apps render. */

/** Which half of the Activity screen is showing. */
export type ActivityView = "feed" | "insights";

/** The two views of the Activity screen, in the order their switch shows them. */
export const ACTIVITY_VIEWS: readonly { value: ActivityView; label: string }[] = [
  { value: "feed", label: "Feed" },
  { value: "insights", label: "Insights" },
];

/**
 * The view Activity opens on. The feed: the screen is reached from the bell,
 * and someone following a notification badge wants to see what happened,
 * not a chart.
 */
export const DEFAULT_ACTIVITY_VIEW: ActivityView = "feed";

/** How far back an insights window can reach, in calendar months. */
export type InsightRange = 3 | 6 | 12;

/** The window sizes offered, shortest first. */
export const INSIGHT_RANGES: readonly { value: InsightRange; label: string }[] = [
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "1 year" },
];

/** The window size insights open on; matches the server's own default. */
export const DEFAULT_INSIGHT_RANGE: InsightRange = 6;

/** How many ranked rows a list shows before folding the rest into one. */
export const RANKED_LIST_LIMIT = 5;

/** Category key the folded tail of a ranked category list is filed under. */
export const OTHER_CATEGORY = "other";

/** Emoji for a category this build has no picture for, and for the folded tail. */
export const FALLBACK_CATEGORY_EMOJI = "🧾";

/** Emoji for the row that stands for expenses outside any group. */
export const OUTSIDE_GROUPS_EMOJI = "🤝";

/** Label for the row that stands for expenses outside any group. */
export const OUTSIDE_GROUPS_LABEL = "Outside groups";

/** Shown in place of a duration when the join date cannot be read. */
export const UNKNOWN_DURATION_LABEL = "Not known";

/** What each split type is called, matching the tabs of the expense form. */
const SPLIT_TYPE_LABELS: Record<string, string> = {
  equal: "Equally",
  exact: "Amounts",
  percent: "Percent",
  shares: "Shares",
  itemized: "Itemized",
};

/**
 * The calendar month a person is in, by their own clock.
 *
 * Sent with an insights request so the newest bar is the month on their
 * wall, not the server's UTC month.
 *
 * @param nowTime - The current time; injected so this stays testable.
 * @returns The local month as "YYYY-MM".
 */
export function currentLocalMonth(nowTime: Date = new Date()): string {
  return `${nowTime.getFullYear()}-${String(nowTime.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Parses a "YYYY-MM" key into a local date on the first of that month.
 *
 * @param month - The month key.
 * @returns The date, or null when the key is not a month.
 */
function monthStart(month: string): Date | null {
  const parts = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, 1);
}

/**
 * The short name under a month's bar, e.g. "Oct".
 *
 * @param month - Month key as the server returns it.
 * @returns The abbreviated month name, or the raw key when it is not a month.
 */
export function monthShortLabel(month: string): string {
  const when = monthStart(month);
  return when ? when.toLocaleDateString(undefined, { month: "short" }) : month;
}

/**
 * Display name of an expense category key.
 *
 * @param category - A category key such as "food".
 * @returns The key with its first letter capitalized.
 */
export function categoryLabel(category: string): string {
  if (category === "") return "General";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Display name of a split type, as the expense form's tabs spell it.
 *
 * @param splitType - A split type key such as "itemized".
 * @returns Its label, or the capitalized key for one this build does not know.
 */
export function splitTypeLabel(splitType: string): string {
  return SPLIT_TYPE_LABELS[splitType] ?? categoryLabel(splitType);
}

/**
 * Pluralizes a counted noun: "1 expense", "4 expenses".
 *
 * @param count - How many there are.
 * @param singular - The noun for exactly one.
 * @returns The count and the noun in the right number.
 */
export function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * The month and year someone joined, e.g. "July 2026".
 *
 * @param memberSince - RFC 3339 instant they joined.
 * @returns The local month and year, or "" when the instant is unparseable.
 */
export function memberSinceLabel(memberSince: string): string {
  const when = new Date(memberSince);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * How long someone has been a member, in the largest unit that fits:
 * "a few hours", "12 days", "3 months", "1 year", "2 years, 4 months".
 * Each reads as the end of "Member for ...".
 *
 * Counted in calendar terms rather than by dividing milliseconds: someone
 * who joined on 31 January has been here "1 month" on 28 February, not
 * "28 days".
 *
 * @param memberSince - RFC 3339 instant they joined.
 * @param nowTime - The current time; injected so this stays testable.
 * @returns The duration, or "" when the instant is unparseable or in the future.
 */
export function memberDuration(memberSince: string, nowTime: Date = new Date()): string {
  const joined = new Date(memberSince);
  if (Number.isNaN(joined.getTime()) || joined.getTime() > nowTime.getTime()) return "";

  let months =
    (nowTime.getFullYear() - joined.getFullYear()) * 12 + (nowTime.getMonth() - joined.getMonth());
  // Not a full month until the day of the month comes round again.
  if (nowTime.getDate() < joined.getDate()) months -= 1;

  if (months < 1) {
    const startOfToday = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate());
    const startOfJoined = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate());
    const days = Math.round((startOfToday.getTime() - startOfJoined.getTime()) / 86_400_000);
    return days < 1 ? "a few hours" : countLabel(days, "day");
  }
  if (months < 12) return countLabel(months, "month");
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder === 0
    ? countLabel(years, "year")
    : `${countLabel(years, "year")}, ${countLabel(remainder, "month")}`;
}

/**
 * A calendar day as a short date, e.g. "14 Jul 2026".
 *
 * Built from the parts rather than `new Date("YYYY-MM-DD")`, which is read
 * as UTC midnight and lands on the previous day for anyone west of London.
 *
 * @param calendarDay - A "YYYY-MM-DD" calendar day.
 * @returns The formatted date, or "" when the text is not a day.
 */
export function calendarDayLabel(calendarDay: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDay);
  if (!parts) return "";
  const when = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A part's share of a whole as a whole-number percentage, e.g. "38%".
 *
 * A part that exists but rounds to nothing reads "<1%" rather than "0%":
 * zero would say the row is empty when its bar plainly is not.
 *
 * @param part - The part's size.
 * @param whole - What it is a part of.
 * @returns The percentage, or "" when there is no whole to be a share of.
 */
export function percentLabel(part: number, whole: number): string {
  if (!(whole > 0) || !(part >= 0)) return "";
  const percent = Math.round((part / whole) * 100);
  return part > 0 && percent === 0 ? "<1%" : `${percent}%`;
}

/**
 * A typical month's amount over a window, to the nearest minor unit.
 *
 * @param totalCents - The window's total.
 * @param monthCount - How many months the window covers.
 * @returns The mean per month; 0 for an empty window.
 */
export function averagePerMonth(totalCents: number, monthCount: number): number {
  return monthCount > 0 ? Math.round(totalCents / monthCount) : 0;
}

/**
 * Keeps the head of a ranked list and folds everything after it into one
 * trailing entry, so a long tail of small categories reads as "Other"
 * instead of pushing the chart off the screen. The folded entry takes one of
 * the rows itself, so it always stands for at least two entries: a single
 * leftover is never swapped for a row that only hides its name.
 *
 * @param ranked - Entries, largest first.
 * @param limit - How many rows the list may show, the folded one included.
 * @param fold - Builds the trailing entry from the entries it replaces.
 * @returns At most `limit` entries.
 */
export function foldTail<Entry>(
  ranked: readonly Entry[],
  limit: number,
  fold: (tail: readonly Entry[]) => Entry,
): Entry[] {
  if (ranked.length <= limit) return [...ranked];
  const head = ranked.slice(0, Math.max(limit - 1, 0));
  return [...head, fold(ranked.slice(head.length))];
}
