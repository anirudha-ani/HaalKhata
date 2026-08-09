/** Local-time rendering of server timestamps: storage is UTC, screens are not. */

/**
 * A timestamp as a short date in the viewer's own timezone, e.g. "Aug 9" —
 * with the year appended only when it is not the current one, where it stops
 * being noise and starts being information.
 *
 * @param timestamp - Server timestamp (ISO 8601 UTC).
 * @param nowTime - The current time, injectable so tests stay deterministic.
 * @returns The local date, or "" when the timestamp does not parse.
 */
export function localDate(timestamp: string, nowTime: Date = new Date()): string {
  const when = new Date(timestamp);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: when.getFullYear() === nowTime.getFullYear() ? undefined : "numeric",
  });
}

/**
 * A timestamp as a short date and clock time in the viewer's own timezone,
 * e.g. "Aug 9, 2:14 PM" (year included when not current, as {@link localDate}).
 *
 * @param timestamp - Server timestamp (ISO 8601 UTC).
 * @param nowTime - The current time, injectable so tests stay deterministic.
 * @returns The local date and time, or "" when the timestamp does not parse.
 */
export function localDateTime(timestamp: string, nowTime: Date = new Date()): string {
  const when = new Date(timestamp);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: when.getFullYear() === nowTime.getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
