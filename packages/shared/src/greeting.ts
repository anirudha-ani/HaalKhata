/**
 * Time-aware English greeting helper for dashboard headers.
 */

/**
 * Returns a time-of-day greeting ("Good morning" / "Good afternoon" /
 * "Good evening") based on the user's local hour.
 *
 * @param now - Date to derive the greeting from (defaults to current time).
 * @returns The greeting string, without a trailing comma.
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
