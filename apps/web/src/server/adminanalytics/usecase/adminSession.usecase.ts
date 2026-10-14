/**
 * Admin session business logic: who may open the admin page, and for how long.
 *
 * An admin is a Google identity on the operator allowlist, not an account in
 * the app. Signing in here never creates, links or reads a users row, and
 * the session it starts is a different credential from an app session: a
 * stolen app token, however it was obtained, opens nothing on this surface.
 */

import crypto from "node:crypto";
import { beginGoogleSignIn, verifyGoogleSignIn } from "@/server/auth/usecase/auth.usecase";
import { UsecaseError, denied } from "@/server/common/errors";
import { logEvent } from "@/server/common/logger";
import {
  ADMIN_SESSION_LIFETIME_SECONDS,
  ADMIN_SESSION_TOKEN_BYTES,
  ADMIN_SESSION_TOKEN_PATTERN,
  adminEmails,
  adminGoogleClientId,
} from "@/server/adminanalytics/adminanalytics.constants";
import {
  deleteAdminSession,
  findAdminSession,
  insertAdminSession,
} from "@/server/adminanalytics/repo/adminSessions.repo";

/**
 * Hashes a session token before it crosses the repository boundary, so a
 * read of the table cannot reveal a usable session.
 *
 * @param token - Raw token as the browser holds it.
 * @returns Lowercase hexadecimal SHA-256 digest.
 */
function sessionTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Issues the single-use nonce for an admin sign-in. The same challenge
 * store the app's sign-in uses: a nonce is a nonce, and the two flows part
 * ways only after the identity is proven.
 *
 * @returns The raw nonce to pass to Google.
 * @throws UsecaseError "invalid_argument" when Google sign-in is not configured.
 */
export async function beginAdminSignIn(): Promise<{ nonce: string }> {
  return beginGoogleSignIn();
}

/**
 * Starts an admin session for a verified Google identity on the allowlist.
 *
 * Exactly one audience is accepted: the client the admin page itself signs
 * in with (see adminGoogleClientId). A token minted for the Android or iOS
 * app has no business here, so a credential lifted from a phone cannot be
 * replayed against this surface; and when the admin page has a client of
 * its own, neither can one minted for the app's web sign-in.
 *
 * Nothing is written unless the address is allowlisted, and no users row is
 * read or written either way.
 *
 * @param idToken - Raw JWT credential produced by Google Identity Services.
 * @returns The new session's raw token, to be set as an HttpOnly cookie.
 * @throws UsecaseError "unauthenticated" when the token fails verification.
 * @throws UsecaseError "permission_denied" when the address is not an admin.
 */
export async function signInAdmin(idToken: string): Promise<{ token: string }> {
  const identity = await verifyGoogleSignIn(idToken, [adminGoogleClientId()]);
  if (!adminEmails().has(identity.email)) {
    // Logged without the address: a refused stranger's email is not ours to keep.
    logEvent("warn", "admin sign-in refused: address is not on the allowlist");
    denied("this Google account does not have admin access");
  }
  const token = crypto.randomBytes(ADMIN_SESSION_TOKEN_BYTES).toString("base64url");
  await insertAdminSession(sessionTokenHash(token), identity.email, ADMIN_SESSION_LIFETIME_SECONDS);
  logEvent("info", "admin session started");
  return { token };
}

/**
 * Confirms a request carries a live admin session.
 *
 * The allowlist is consulted again on every request, not only at sign-in:
 * removing an address from ADMIN_EMAILS ends its sessions the moment the
 * server restarts with the new value, and the orphaned row is deleted the
 * first time it is presented.
 *
 * @param token - The admin cookie's value; null when the request has none.
 * @throws UsecaseError "unauthenticated" when there is no session, it has
 *   expired or been ended, or its address is no longer an admin.
 */
export async function requireAdminSession(token: string | null): Promise<void> {
  if (!token || !ADMIN_SESSION_TOKEN_PATTERN.test(token)) {
    throw new UsecaseError("unauthenticated", "sign in to continue");
  }
  const tokenHash = sessionTokenHash(token);
  const session = await findAdminSession(tokenHash);
  if (!session) {
    throw new UsecaseError("unauthenticated", "admin session expired, please sign in again");
  }
  if (!adminEmails().has(session.email)) {
    await deleteAdminSession(tokenHash);
    throw new UsecaseError("unauthenticated", "admin session expired, please sign in again");
  }
}

/**
 * Ends an admin session on the server. A missing or malformed token is not
 * an error: there is nothing to end, and the caller clears the cookie anyway.
 *
 * @param token - The admin cookie's value; null when the request has none.
 */
export async function signOutAdmin(token: string | null): Promise<void> {
  if (!token || !ADMIN_SESSION_TOKEN_PATTERN.test(token)) return;
  await deleteAdminSession(sessionTokenHash(token));
}
