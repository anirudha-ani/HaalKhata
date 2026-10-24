/** Reads a "YYYY-MM-DD" day as that same day on the viewer's own calendar. */

/**
 * Builds a local Date for a day, from its parts.
 *
 * Not `new Date("YYYY-MM-DD")`, which is read as UTC midnight and shows the
 * previous day anywhere west of London.
 *
 * @param isoDay - "YYYY-MM-DD".
 * @returns Local midnight of that day, or null when the text is not a day.
 */
export function calendarDay(isoDay: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}
