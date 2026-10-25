/** Pure geometry and labelling for the bar charts both apps draw: axis ceilings, bar lengths, tick text. */

import { currencyInfo, minorUnitDigits } from "../money/money.constants";

/**
 * Multiples of a power of ten an amount axis may end on. Fine enough that
 * the tallest bar always fills more than four fifths of the plot, and chosen
 * so that half of each is itself a figure a tick label can show without
 * rounding (which rules out 2.5, whose half is 1.25).
 */
const AMOUNT_STEPS = [1, 1.2, 1.5, 2, 3, 4, 5, 6, 8, 10];

/**
 * Multiples of a power of ten a count axis may end on, chosen so the
 * halfway gridline is always a whole number: half an expense is not a
 * thing to label. The even steps halve whole at any magnitude. 1 is there
 * so a busiest bar of exactly 10, 100 or 1,000 fills the plot instead of
 * half of it; it only applies from 10 up, where it halves to 5, 50, 500,
 * because countCeiling never asks about a maximum below 2.
 */
const COUNT_STEPS = [1, 2, 4, 6, 8, 10];

/** Most axis labels drawn under a column chart's columns before they are thinned out. */
export const MAXIMUM_AXIS_LABELS = 6;

/**
 * Shortest a column with a value is drawn, as a percentage of the plot.
 * Without a floor a small month next to a large one rounds to nothing and
 * reads as "no spending", which is a different fact.
 */
export const MINIMUM_COLUMN_PERCENT = 2;

/**
 * Rounds a maximum up to the next step on a ladder of round numbers.
 *
 * @param maximum - The largest value the axis must hold.
 * @param steps - Allowed multiples of the value's power of ten, ascending.
 * @returns The ceiling, or the smallest step when there is nothing to hold.
 */
function ceilingOnSteps(maximum: number, steps: readonly number[]): number {
  if (!(maximum > 0)) return steps[0];
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const scaled = maximum / magnitude;
  // The tolerance absorbs float noise from the division: 0.7 / 0.1 is 7.000000000000001.
  const step = steps.find((candidate) => scaled <= candidate + 1e-9) ?? steps[steps.length - 1];
  return step * magnitude;
}

/**
 * The round number an amount axis should end on so its tallest bar has
 * headroom and its gridlines read as clean figures.
 *
 * @param maximum - The largest value plotted.
 * @returns A ceiling at or above it, a round multiple of a power of ten.
 */
export function niceCeiling(maximum: number): number {
  return ceilingOnSteps(maximum, AMOUNT_STEPS);
}

/**
 * The ceiling for an axis of whole things. Never below 2, so a chart whose
 * biggest bar is 1 still has a whole-number halfway line.
 *
 * @param maximum - The largest count plotted.
 * @returns A ceiling at or above it whose half is a whole number.
 */
export function countCeiling(maximum: number): number {
  return ceilingOnSteps(Math.max(maximum, 2), COUNT_STEPS);
}

/**
 * The ceiling for an axis of money, in the currency's minor units. Rounded
 * in major units, since those are what the tick labels show: a ceiling of
 * 25,000 cents is a clean "$250", while 30,000 yen is already a clean
 * "¥30K" without any division.
 *
 * @param maximumCents - The largest amount plotted, in minor units.
 * @param currency - ISO 4217 code the amounts are in.
 * @returns A ceiling in minor units.
 */
export function moneyCeiling(maximumCents: number, currency: string): number {
  const unit = 10 ** minorUnitDigits(currency);
  return Math.round(niceCeiling(maximumCents / unit) * unit);
}

/**
 * How much of the axis a value fills.
 *
 * @param value - The value plotted.
 * @param ceiling - What the axis ends on.
 * @returns A fraction from 0 to 1; 0 for a missing, negative or unplottable value.
 */
export function barFraction(value: number, ceiling: number): number {
  if (!(ceiling > 0) || !(value > 0)) return 0;
  return Math.min(value / ceiling, 1);
}

/**
 * Whether the bar at a position gets an axis label when there is no room to
 * label every one. Counted back from the newest bar, so the label under the
 * rightmost column, the one a person reads first, never drops out.
 *
 * @param index - The bar's position, oldest first.
 * @param count - How many bars there are.
 * @param maximumLabels - How many labels fit.
 * @returns True when this bar's label should be drawn.
 */
export function showsAxisLabel(index: number, count: number, maximumLabels: number): boolean {
  const stride = Math.max(1, Math.ceil(count / Math.max(maximumLabels, 1)));
  return (count - 1 - index) % stride === 0;
}

/**
 * Shortens a number for a tick label: 0.75, 950, 1.2K, 30K, 4.5M.
 *
 * @param value - A non-negative number.
 * @returns Its compact spelling, to two decimals with trailing zeros dropped.
 */
export function compactNumber(value: number): string {
  /** Trims a scaled value to two decimals, dropping trailing zeros. */
  const trimmed = (scaled: number) => String(Math.round(scaled * 100) / 100);
  if (value >= 1_000_000_000) return `${trimmed(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${trimmed(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimmed(value / 1_000)}K`;
  return trimmed(value);
}

/**
 * A money amount short enough for an axis tick, e.g. "$2.5K".
 *
 * Deliberately not `Intl` compact notation: the same tick has to render the
 * same way in a browser and in Hermes, and a tick is a round number that
 * needs no locale's opinion about grouping.
 *
 * @param cents - The amount in the currency's minor units.
 * @param currency - ISO 4217 code.
 * @returns The symbol followed by the compact amount.
 */
export function compactMoney(cents: number, currency: string): string {
  const symbol = currencyInfo(currency)?.symbol ?? currency;
  return `${symbol}${compactNumber(cents / 10 ** minorUnitDigits(currency))}`;
}
