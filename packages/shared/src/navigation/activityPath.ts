/** Strict validation for server-provided activity-feed navigation targets. */

/** In-app routes an activity event is allowed to open. */
export type ActivityPath =
  | "/activity"
  | "/friends"
  | `/expenses/${string}`
  | `/friends/${string}`
  | `/groups/${string}`;

/** Route-segment shape used by generated UUIDs and legacy test/seed ids. */
const ACTIVITY_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Returns an allowlisted in-app destination for an untrusted activity link.
 * Absolute URLs, schemes, protocol-relative paths, traversal, query strings,
 * fragments, percent encoding, and unknown app routes all fall back safely.
 *
 * @param candidate - Link read from the server or persisted activity row.
 * @param fallback - Known-safe destination used when candidate is invalid.
 * @returns Candidate when it names an allowed activity route, otherwise fallback.
 */
export function safeActivityPath(
  candidate: string,
  fallback: "/activity" | "/friends" = "/activity",
): ActivityPath {
  if (candidate === "/activity" || candidate === "/friends") return candidate;
  const segments = candidate.split("/");
  if (segments.length !== 3 || segments[0] !== "") return fallback;
  const [, route, identifier] = segments;
  if (
    (route !== "expenses" && route !== "friends" && route !== "groups") ||
    !ACTIVITY_IDENTIFIER_PATTERN.test(identifier ?? "")
  ) {
    return fallback;
  }
  return candidate as ActivityPath;
}

/** In-app routes a push notification is allowed to open: the feed's, plus Account. */
export type NotificationPath = ActivityPath | "/account";

/**
 * Returns an allowlisted destination for a tapped push notification. The
 * same rules as {@link safeActivityPath}, plus Account, which a security
 * alert (a verified number moving to another account) links to.
 *
 * @param candidate - Link carried in the push payload; untrusted.
 * @returns Candidate when it names an allowed route, otherwise "/activity".
 */
export function safeNotificationPath(candidate: unknown): NotificationPath {
  if (typeof candidate !== "string") return "/activity";
  if (candidate === "/account") return candidate;
  return safeActivityPath(candidate);
}
