/** Admin analytics domain constants: the operator allowlist, session settings and read limits. */

import { GOOGLE_CLIENT_ID } from "@/server/auth/auth.constants";

/**
 * Name of the cookie that carries an admin session. Never the app's session
 * cookie under another host: the two are different credentials, and a
 * request carrying one is never mistaken for a request carrying the other.
 * Production uses the browser-enforced `__Host-` prefix (host-only, Secure,
 * Path=/), which pins it to the admin hostname.
 */
export const ADMIN_SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-hk_admin" : "hk_admin";

/**
 * How long an admin session lasts. A working day, with no renewal: looking
 * at usage is an occasional task, and a credential that quietly renews
 * itself for as long as a tab stays open is one nobody remembers to end.
 */
export const ADMIN_SESSION_LIFETIME_SECONDS = 60 * 60 * 8;

/** Random bytes in an admin session token; 32 encode to 43 base64url chars. */
export const ADMIN_SESSION_TOKEN_BYTES = 32;

/** Base64url shape of a token produced from {@link ADMIN_SESSION_TOKEN_BYTES}. */
export const ADMIN_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Sign-in attempts (begin plus exchange) accepted per client address per
 * minute. Half the app's allowance: exactly one person is expected here.
 */
export const ADMIN_AUTH_RATE_LIMIT = 5;

/**
 * Overview reads accepted per minute across all admin sessions. Each one
 * aggregates whole tables, so the ceiling protects the database from a
 * refresh loop more than from an attacker, who cannot get this far.
 */
export const ADMIN_READ_RATE_LIMIT = 30;

/** Most people the overview lists; the totals count everyone regardless. */
export const USAGE_USER_LIMIT = 500;

/** How many periods (weeks or months) one window of the trend shows. */
export const TREND_PERIOD_COUNT = 12;

/**
 * Trend reads accepted per minute across all admin sessions. Higher than
 * the overview's: each press of Earlier or Later is one, and a person
 * paging back through a year of weeks presses it a few times running.
 */
export const ADMIN_TREND_RATE_LIMIT = 60;

/** Trailing days that count someone as active this week. */
export const WEEKLY_ACTIVE_DAYS = 7;

/** Trailing days that count someone as active this month. */
export const MONTHLY_ACTIVE_DAYS = 30;

/**
 * The Google addresses allowed to open the admin page, from ADMIN_EMAILS
 * (comma separated). Empty means nobody: with no allowlist there is no
 * admin, rather than an admin page anyone signed in could reach.
 *
 * Configuration, not code, so the operator's address is not committed to a
 * public repository. Read at call time rather than captured at import so a
 * test can exercise both an empty and a populated list.
 *
 * @returns The allowlisted addresses, trimmed and lowercased.
 */
export function adminEmails(): ReadonlySet<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

/**
 * The OAuth client id the admin page signs in with, and the only audience
 * an admin sign-in token may name.
 *
 * ADMIN_GOOGLE_CLIENT_ID when set, otherwise the app's own web client.
 * A dedicated client is the stricter setup, and the reason is the origin
 * list Google keeps per client. Google mints an ID token only for a page on
 * one of the client's authorized JavaScript origins. With one client shared
 * by both hostnames, a script injected into the app could ask Google for a
 * token as the signed-in operator and present it here; with a client whose
 * only authorized origin is the admin hostname, no page on the app's origin
 * can obtain a token this surface accepts.
 *
 * A dedicated client is an addition to GOOGLE_CLIENT_ID, not a substitute:
 * the sign-in challenge and the token verifier are the app's own and are
 * only set up when the app's client is configured. So without
 * GOOGLE_CLIENT_ID this reports "not configured" whatever else is set,
 * rather than offering a button whose first request would be refused.
 *
 * Read at call time, like the allowlist. Public, like every client id.
 *
 * @returns The client id, or "" when Google sign-in is not configured.
 */
export function adminGoogleClientId(): string {
  if (GOOGLE_CLIENT_ID.length === 0) return "";
  return (process.env.ADMIN_GOOGLE_CLIENT_ID ?? "").trim() || GOOGLE_CLIENT_ID;
}

/**
 * Builds the Set-Cookie attribute string for the admin session.
 *
 * SameSite=Strict, where the app's cookie is Lax: nothing links into the
 * admin page from elsewhere, so there is no cross-site navigation to keep
 * working, and Strict keeps the cookie off every request another site
 * starts. It does nothing against the app's own hostname, which is the same
 * site as this one; the admin handlers' Origin check is what covers that.
 *
 * @param token - Session token value, or empty string to clear the cookie.
 * @param maxAge - Lifetime in seconds; pass 0 to expire immediately.
 * @returns The full cookie attribute string for Set-Cookie.
 */
export function adminSessionCookieAttributes(token: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${maxAge}`;
}
