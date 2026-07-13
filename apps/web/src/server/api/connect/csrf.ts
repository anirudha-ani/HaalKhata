/** CSRF guard: reject cookie-authenticated state-changing requests with a foreign Origin. */

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Connect RPCs are all POST. A browser performing a CSRF attack would send a
 * cross-origin POST that *carries the victim's session cookie* (cookies are
 * attached automatically by the browser) but has no `Authorization` header.
 * Bearer-token clients (mobile) are not CSRF-vulnerable, so they are exempt.
 *
 * This guard blocks such requests unless the `Origin` (or `Referer` fallback)
 * matches the request's own host. Same-origin fetches from the app always
 * carry a matching `Origin`.
 *
 * @param request - Incoming Next.js API request.
 * @param response - Next.js API response used to send the 403.
 * @returns True when the request is allowed to proceed; false when rejected.
 */
export function csrfGuard(request: NextApiRequest, response: NextApiResponse): boolean {
  // Only state-changing methods need protection; Connect only uses POST, but
  // be defensive and cover everything except the safe verbs.
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return true;
  }
  const hasCookie = typeof request.headers.cookie === "string" && request.headers.cookie.length > 0;
  const hasBearer = /^bearer\s+\S+/i.test(request.headers.authorization ?? "");
  // Mobile / API clients send a Bearer token — CSRF doesn't leak those.
  if (!hasCookie || hasBearer) return true;

  const origin = request.headers.origin ?? request.headers.referer ?? "";
  if (origin.length === 0) {
    response.status(403).json({ error: "missing Origin header" });
    return false;
  }
  const requestHost = request.headers.host ?? "";
  try {
    const parsed = new URL(origin);
    if (parsed.host === requestHost) return true;
  } catch {
    // malformed Origin — fall through to rejection
  }
  response.status(403).json({ error: "cross-origin request blocked" });
  return false;
}
