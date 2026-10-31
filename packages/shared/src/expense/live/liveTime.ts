/** How long a live split has left, for its bar on both apps. */

/**
 * How long a live split has left, in words.
 *
 * @param endsAt - When it ends (ISO 8601).
 * @param clock - The time now, in milliseconds.
 * @returns The words; "" once it is over.
 */
export function liveTimeLeft(endsAt: string, clock: number): string {
  const secondsLeft = Math.ceil((new Date(endsAt).getTime() - clock) / 1000);
  if (secondsLeft <= 0) return "";
  if (secondsLeft < 60) return "Under a minute left";
  return `${Math.ceil(secondsLeft / 60)} min left`;
}
