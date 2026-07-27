/** Pure formatting helpers for the activity feed: date headings, month labels, amount de-duplication. */

import { formatMoney } from "@haalkhata/shared/money/money";

/** Milliseconds in a day, for the Today/Yesterday comparison. */
const DAY_MS = 86_400_000;

/**
 * Heading a feed row is filed under: "Today", "Yesterday", or the date.
 *
 * Grouping by day is what makes a chronological feed scannable — you look for
 * when something happened before you look for what it was.
 *
 * @param timestamp - The event's created_at, any parseable date string.
 * @param nowTime - The current time, injected so this stays pure and testable.
 * @returns The heading text for that event's day.
 */
export function dayHeading(timestamp: string, nowTime: Date): string {
  const when = new Date(timestamp);
  if (Number.isNaN(when.getTime())) return "Earlier";
  const startOfToday = new Date(
    nowTime.getFullYear(),
    nowTime.getMonth(),
    nowTime.getDate(),
  ).getTime();
  const startOfEvent = new Date(
    when.getFullYear(),
    when.getMonth(),
    when.getDate(),
  ).getTime();
  const daysAgo = Math.round((startOfToday - startOfEvent) / DAY_MS);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    // Only name the year once it is not the current one — it is noise otherwise.
    year: when.getFullYear() === nowTime.getFullYear() ? undefined : "numeric",
  });
}

/** A run of consecutive events that happened on the same day. */
export interface DayGroup<Event> {
  /** "Today", "Yesterday", or the formatted date. */
  heading: string;
  /** The events under that heading, in the order they arrived. */
  events: Event[];
}

/**
 * Splits an already-sorted feed into runs of one day each.
 *
 * Done as a pure pass rather than by tracking the previous heading while
 * rendering: mutating a variable across a render is exactly what the React
 * Compiler rejects, and a real grouped structure also lets each day be its own
 * heading-plus-list instead of headings floating inside one flat list.
 *
 * @param events - Feed events, newest first.
 * @param nowTime - The current time, for the Today/Yesterday comparison.
 * @returns One group per day, in the order the events came in.
 */
export function groupByDay<Event extends { createdAt: string }>(
  events: Event[],
  nowTime: Date,
): DayGroup<Event>[] {
  const groups: DayGroup<Event>[] = [];
  for (const event of events) {
    const heading = dayHeading(event.createdAt, nowTime);
    const current = groups[groups.length - 1];
    if (current && current.heading === heading) current.events.push(event);
    else groups.push({ heading, events: [event] });
  }
  return groups;
}

/**
 * Clock time for a feed row, e.g. "2:14 PM".
 *
 * @param timestamp - The event's created_at.
 * @returns Localised time of day, or "" when the timestamp is unparseable.
 */
export function timeOfDay(timestamp: string): string {
  const when = new Date(timestamp);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Human label for a "YYYY-MM" month key, e.g. "July 2026".
 *
 * @param month - Month key as the server returns it.
 * @returns The label, or the raw key when it is not a month.
 */
export function monthLabel(month: string): string {
  const parts = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parts) return month;
  const when = new Date(Number(parts[1]), Number(parts[2]) - 1, 1);
  return when.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Removes the money the row already shows as a figure from its sentence.
 *
 * Feed messages are pre-rendered server-side with the amount inside them
 * ("added \"Zazie\" (USD 43.45)"). Now that the amount is a structured field
 * laid out as a right-aligned figure, leaving it in the sentence prints it
 * twice. Only an exact match of the known amount is removed, so a message
 * that happens to contain other digits is never mangled.
 *
 * @param message - The server's pre-rendered sentence.
 * @param amountCents - The event's amount; 0 means there is nothing to strip.
 * @param currency - ISO 4217 code the amount was formatted with.
 * @returns The sentence with the duplicated amount taken out.
 */
export function withoutAmount(
  message: string,
  amountCents: number,
  currency: string,
): string {
  if (amountCents === 0 || !currency) return message;
  const formatted = formatMoney(amountCents, currency);
  const plain = `${currency} ${(amountCents / 100).toFixed(2)}`;
  return message
    .replace(` (${formatted})`, "")
    .replace(` (${plain})`, "")
    .replace(` ${formatted}`, "")
    .replace(` ${plain}`, "")
    .trim();
}
