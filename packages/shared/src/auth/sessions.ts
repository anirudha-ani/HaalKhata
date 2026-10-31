/** A person's list of sign-ins: its wording and order, the same on both apps. */

/** How often an open list of devices looks again: somebody checking for one they don't know may sit on it. */
export const SESSIONS_REFRESH_INTERVAL_MS = 30_000;

/** What a phone is called when it does not say what it is. */
export const UNNAMED_APP_DEVICE = "HaalKhata app";

/** Section title in settings. */
export const SESSIONS_TITLE = "Where you’re signed in";

/** Shown on the session being used to read the list. */
export const THIS_DEVICE_LABEL = "This device";

/** What the server says when asked to end the session asking. */
export const OWN_SESSION_REFUSAL_MESSAGE = "use Sign out to sign out of this device";

/** Signs out one other device. */
export const END_SESSION_LABEL = "Sign out";

/** Signs out every other device. */
export const END_OTHER_SESSIONS_LABEL = "Sign out everywhere else";

/** The one thing to know before signing out everywhere else. */
export const END_OTHER_SESSIONS_WARNING = "You’ll stay signed in here. Every other device will need to sign in again.";

/** Confirms signing out everywhere else. */
export const END_OTHER_SESSIONS_CONFIRM_LABEL = "Yes, sign them out";

/** Backs out of signing out everywhere else. */
export const END_OTHER_SESSIONS_CANCEL_LABEL = "Keep them";

/** What the app calls a day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days in a month, near enough for "about 3 months ago". */
const DAYS_PER_MONTH = 30;

/** The fields of a sign-in the wording needs. */
export interface SessionLine {
  device: string;
  isApp: boolean;
  lastUsedAt: string;
  current: boolean;
}

/**
 * Says how long ago a device was used, no more exactly than it is known:
 * a session only notes its use once a day.
 *
 * @param lastUsedAt - When it was last used, as an ISO timestamp.
 * @param clock - The time now, in milliseconds.
 * @returns "Active today", "Active 3 days ago", "Active about 2 months ago".
 */
export function lastActiveLabel(lastUsedAt: string, clock: number): string {
  const days = Math.max(0, Math.floor((clock - new Date(lastUsedAt).getTime()) / DAY_MS));
  if (days === 0) return "Active today";
  if (days === 1) return "Active yesterday";
  if (days < DAYS_PER_MONTH) return `Active ${days} days ago`;
  const months = Math.floor(days / DAYS_PER_MONTH);
  return months === 1 ? "Active about a month ago" : `Active about ${months} months ago`;
}

/**
 * The line under a device's name.
 *
 * @param session - The sign-in.
 * @param clock - The time now, in milliseconds.
 * @returns "This device", or what it is and how recently it was used.
 */
export function sessionDetail(session: SessionLine, clock: number): string {
  if (session.current) return THIS_DEVICE_LABEL;
  const lastActive = lastActiveLabel(session.lastUsedAt, clock);
  return session.isApp && session.device !== UNNAMED_APP_DEVICE ? `${UNNAMED_APP_DEVICE} · ${lastActive}` : lastActive;
}

/**
 * Puts the device being used first and leaves the rest as they came, most
 * recently used first.
 *
 * @param sessions - The sign-ins.
 * @returns The same sign-ins in the order to show them.
 */
export function sessionsInOrder<Session extends { current: boolean }>(sessions: readonly Session[]): Session[] {
  return [...sessions.filter((session) => session.current), ...sessions.filter((session) => !session.current)];
}
