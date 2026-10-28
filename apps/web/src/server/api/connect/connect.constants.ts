/** Transport-layer constants: session cookie settings and error-code mapping. */

import { Code } from "@connectrpc/connect";
import type { UsecaseErrorCode } from "@/server/common/errors";
import { TOKEN_LIFETIME_SECONDS } from "@/server/auth/auth.constants";

/**
 * Name of the HTTP cookie that carries the web client's session token.
 * Production uses the browser-enforced `__Host-` prefix; development keeps a
 * plain name so LAN-hosted HTTP sessions continue to work.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-hk_token" : "hk_token";

/** Session cookie lifetime in seconds, exactly matching the signed token. */
export const COOKIE_MAX_AGE = TOKEN_LIFETIME_SECONDS;

/**
 * Largest request most services accept, checked after decompression, so a
 * few compressed bytes cannot expand past it. Their biggest legitimate
 * message (a profile, a payment method, a hundred group member ids) is a few
 * kilobytes.
 */
export const DEFAULT_READ_MAX_BYTES = 64 * 1024;

/**
 * Largest expense request: an itemized expense may carry 100 items each
 * assigned to up to 100 people, about half a mebibyte.
 */
export const EXPENSE_READ_MAX_BYTES = 1024 * 1024;

/**
 * Largest social request: one contact lookup sends up to 1,000 identifiers of
 * up to 254 characters each, about 257 KB.
 */
export const SOCIAL_READ_MAX_BYTES = 512 * 1024;

/**
 * Largest receipt request. Receipt images are capped at 8 MiB; 12 MiB leaves
 * room for protobuf/JSON base64 overhead. Only signed-in callers get this
 * far: the request gate runs before the body is read.
 */
export const RECEIPT_READ_MAX_BYTES = 12 * 1024 * 1024;

/**
 * How long a request's body may take to arrive in full before the
 * connection is dropped. Clients give a whole call 30 s; anything else that
 * fits its cap arrives in a few seconds even on a slow network.
 */
export const BODY_READ_TIMEOUT_MS = 15_000;

/** The same for a receipt photo, which clients give 120 s to upload and parse. */
export const RECEIPT_BODY_READ_TIMEOUT_MS = 60_000;

/** Path segment of the receipt service's RPCs, which get the longer body deadline. */
export const RECEIPT_SERVICE_PATH = "/receipt.v1.ReceiptService/";

/** What a call that needs a session says when it has none. */
export const SIGN_IN_REQUIRED_MESSAGE = "sign in to continue";

/** Which session cookie to write, and how strictly a browser keeps it to requests its own site starts. */
export interface SessionCookiePolicy {
  /** The cookie's name. */
  name: string;
  /** Its SameSite attribute. */
  sameSite: "Lax" | "Strict";
}

/**
 * The app's session cookie. Lax, so following a link into the app from
 * another site (an email, a shared invite) arrives signed in.
 */
export const APP_SESSION_COOKIE_POLICY: SessionCookiePolicy = { name: SESSION_COOKIE, sameSite: "Lax" };

/**
 * Builds the Set-Cookie attribute string for a session token: the app's,
 * or with another policy the admin page's. Every session cookie is built
 * here, so HttpOnly, the path and the `Secure` rule are written once. The
 * `Secure` flag is added only in production so dev over plain HTTP
 * (localhost) still works; production must run behind a TLS-terminating
 * reverse proxy.
 *
 * @param token - Session token value, or empty string to clear the cookie.
 * @param maxAge - Lifetime in seconds; pass 0 to expire immediately.
 * @param policy - Which cookie, and its SameSite; the app's by default.
 * @returns The full session-cookie attribute string for Set-Cookie.
 */
export function sessionCookieAttributes(
  token: string,
  maxAge: number,
  policy: SessionCookiePolicy = APP_SESSION_COOKIE_POLICY,
): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${policy.name}=${token}; Path=/; HttpOnly; SameSite=${policy.sameSite}${secure}; Max-Age=${maxAge}`;
}

/** Lookup from UsecaseErrorCode to the equivalent Connect status code. */
export const CODE_MAP: Record<UsecaseErrorCode, Code> = {
  invalid_argument: Code.InvalidArgument,
  unauthenticated: Code.Unauthenticated,
  permission_denied: Code.PermissionDenied,
  not_found: Code.NotFound,
  already_exists: Code.AlreadyExists,
  failed_precondition: Code.FailedPrecondition,
  resource_exhausted: Code.ResourceExhausted,
  unavailable: Code.Unavailable,
};
