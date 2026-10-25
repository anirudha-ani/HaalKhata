/**
 * Pure calendar math for the usage trend: which periods a window covers,
 * and where the page can go from it. Days are "YYYY-MM-DD" in UTC, weeks
 * start on Monday and months on the 1st: the boundaries Postgres's
 * date_trunc uses, so a count the database groups lands in the period this
 * file names for it.
 */

/** How long one bar of the trend is. */
export type TrendPeriodUnit = "week" | "month";

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/**
 * Reads a day as UTC midnight.
 *
 * @param isoDay - "YYYY-MM-DD".
 * @returns Milliseconds since the epoch.
 */
function dayToTime(isoDay: string): number {
  return Date.UTC(Number(isoDay.slice(0, 4)), Number(isoDay.slice(5, 7)) - 1, Number(isoDay.slice(8, 10)));
}

/**
 * Writes an instant's UTC calendar day.
 *
 * @param time - Milliseconds since the epoch.
 * @returns "YYYY-MM-DD".
 */
function timeToDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * The UTC calendar day an instant falls on.
 *
 * @param instant - Any instant.
 * @returns "YYYY-MM-DD".
 */
export function utcDay(instant: Date): string {
  return timeToDay(instant.getTime());
}

/**
 * The first day of the period holding a day.
 *
 * @param isoDay - "YYYY-MM-DD".
 * @param unit - Week or month.
 * @returns The Monday of its week, or the 1st of its month.
 */
export function periodStartOf(isoDay: string, unit: TrendPeriodUnit): string {
  if (unit === "month") return `${isoDay.slice(0, 7)}-01`;
  const time = dayToTime(isoDay);
  // getUTCDay counts from Sunday; a Monday-based week is six days into it on a Sunday.
  const daysSinceMonday = (new Date(time).getUTCDay() + 6) % 7;
  return timeToDay(time - daysSinceMonday * DAY_MS);
}

/**
 * Moves a period's start by whole periods.
 *
 * @param start - A period's first day.
 * @param unit - Week or month.
 * @param periods - How many periods; negative moves back.
 * @returns The first day of the period that many away.
 */
export function shiftPeriod(start: string, unit: TrendPeriodUnit, periods: number): string {
  if (unit === "week") return timeToDay(dayToTime(start) + periods * 7 * DAY_MS);
  const time = dayToTime(start);
  const date = new Date(time);
  return timeToDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + periods, 1));
}

/**
 * The day before another.
 *
 * @param isoDay - "YYYY-MM-DD".
 * @returns The previous day.
 */
function dayBefore(isoDay: string): string {
  return timeToDay(dayToTime(isoDay) - DAY_MS);
}

/**
 * The last day of a period.
 *
 * @param start - The period's first day.
 * @param unit - Week or month.
 * @returns Its last day.
 */
export function periodEndOn(start: string, unit: TrendPeriodUnit): string {
  return dayBefore(shiftPeriod(start, unit, 1));
}

/**
 * The end day of the first window: the one that opens with the period
 * holding the first thing that ever happened, or today's window when the
 * whole history is shorter than one window.
 *
 * @param firstDay - The first day anything happened.
 * @param unit - Week or month.
 * @param count - Periods per window.
 * @param today - Today, UTC.
 * @returns The day the first window's last period holds.
 */
function firstWindowEndOn(firstDay: string, unit: TrendPeriodUnit, count: number, today: string): string {
  const lastDay = periodEndOn(shiftPeriod(periodStartOf(firstDay, unit), unit, count - 1), unit);
  return lastDay < today ? lastDay : today;
}

/**
 * Settles which day the window ends on: the day asked for, but never after
 * today, and never so early that the window would open before the first
 * thing that happened. Such a window is moved to the first one, so the
 * page never shows a run of empty bars from before there was anything to
 * count. Days compare as text because they are zero padded.
 *
 * @param requested - The day the page asked for; "" for today.
 * @param today - Today, UTC.
 * @param firstDay - The first day anything happened; null when nothing has.
 * @param shape - Week or month, and periods per window.
 * @returns The day the window's last period holds.
 */
export function resolveEndOn(
  requested: string,
  today: string,
  firstDay: string | null,
  shape: { unit: TrendPeriodUnit; count: number },
): string {
  if (requested === "" || requested > today) return today;
  if (firstDay === null) return requested;
  const opensOn = shiftPeriod(periodStartOf(requested, shape.unit), shape.unit, 1 - shape.count);
  return opensOn < periodStartOf(firstDay, shape.unit)
    ? firstWindowEndOn(firstDay, shape.unit, shape.count, today)
    : requested;
}

/**
 * The first days of a window's periods.
 *
 * @param endOn - A day inside the last period.
 * @param unit - Week or month.
 * @param count - How many periods.
 * @returns First days, oldest first.
 */
export function windowStarts(endOn: string, unit: TrendPeriodUnit, count: number): string[] {
  const lastStart = periodStartOf(endOn, unit);
  return Array.from({ length: count }, (_unused, index) =>
    shiftPeriod(lastStart, unit, index - (count - 1)),
  );
}

/**
 * Where the page can go from a window: the end day of the window just
 * before it, just after it, and the first window that holds anything.
 * Empty where there is nowhere to go.
 *
 * @param starts - The window's period starts, oldest first.
 * @param unit - Week or month.
 * @param today - Today, UTC.
 * @param firstDay - The first day anything happened; null when nothing has.
 * @returns The three end days.
 */
export function trendNavigation(
  starts: readonly string[],
  unit: TrendPeriodUnit,
  today: string,
  firstDay: string | null,
): { earlierEndOn: string; laterEndOn: string; firstEndOn: string } {
  const firstStart = starts[0];
  const lastStart = starts[starts.length - 1];
  const holdsToday = periodStartOf(today, unit) <= lastStart;
  const somethingEarlier = firstDay !== null && firstDay < firstStart;
  const laterEnd = periodEndOn(shiftPeriod(lastStart, unit, starts.length), unit);
  return {
    earlierEndOn: somethingEarlier ? dayBefore(firstStart) : "",
    laterEndOn: holdsToday ? "" : laterEnd < today ? laterEnd : today,
    firstEndOn:
      somethingEarlier && firstDay !== null
        ? firstWindowEndOn(firstDay, unit, starts.length, today)
        : "",
  };
}

/** One metric's count for one period, as the database groups it. */
export interface PeriodCount {
  metric: "users" | "expenses" | "payments" | "scans";
  /** The period's first day. */
  periodStart: string;
  count: number;
}

/** One period of the trend, every metric side by side. */
export interface TrendPeriodUsage {
  startOn: string;
  endOn: string;
  newUserCount: number;
  expenseCount: number;
  paymentCount: number;
  receiptScanCount: number;
}

/**
 * Lays grouped counts out as one row per period, zeros included, so a
 * quiet period shows as an empty bar rather than a missing one.
 *
 * @param starts - The periods to cover, oldest first.
 * @param unit - Week or month.
 * @param counts - Counts grouped by metric and period; empty periods are absent.
 * @returns One entry per period, in the order given.
 */
export function assemblePeriods(
  starts: readonly string[],
  unit: TrendPeriodUnit,
  counts: readonly PeriodCount[],
): TrendPeriodUsage[] {
  const periods = new Map<string, TrendPeriodUsage>(
    starts.map((startOn) => [
      startOn,
      {
        startOn,
        endOn: periodEndOn(startOn, unit),
        newUserCount: 0,
        expenseCount: 0,
        paymentCount: 0,
        receiptScanCount: 0,
      },
    ]),
  );
  for (const entry of counts) {
    const period = periods.get(entry.periodStart);
    // A query bounded by the window cannot return a period outside it;
    // skipping one keeps a stray row out of the wrong bar.
    if (!period) continue;
    if (entry.metric === "users") period.newUserCount += entry.count;
    else if (entry.metric === "expenses") period.expenseCount += entry.count;
    else if (entry.metric === "payments") period.paymentCount += entry.count;
    else period.receiptScanCount += entry.count;
  }
  return [...periods.values()];
}
