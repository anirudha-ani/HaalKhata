/** All SQL for the admin_sessions table: start, look up and end an operator's session. */

import { execute, queryOne } from "@/server/common/db/db";

/** The part of a live admin session a request needs. */
export interface AdminSessionRow {
  /** The Google address the session was started for. */
  email: string;
}

/**
 * Stores a new admin session after removing every expired one.
 *
 * @param tokenHash - SHA-256 hex digest of the token sent to the browser.
 * @param email - Verified, allowlisted Google address that signed in.
 * @param lifetimeSeconds - Seconds until the session expires.
 */
export async function insertAdminSession(
  tokenHash: string,
  email: string,
  lifetimeSeconds: number,
): Promise<void> {
  await execute("DELETE FROM admin_sessions WHERE expires_at <= now()", []);
  await execute(
    `INSERT INTO admin_sessions (token_hash, email, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [tokenHash, email, lifetimeSeconds],
  );
}

/**
 * Looks up an unexpired admin session by its token digest.
 *
 * @param tokenHash - SHA-256 hex digest of the token the request carried.
 * @returns The session, or undefined when unknown or expired.
 */
export async function findAdminSession(tokenHash: string): Promise<AdminSessionRow | undefined> {
  return queryOne<AdminSessionRow>(
    `SELECT email FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
}

/**
 * Ends one admin session. Deleting a session that does not exist is not an
 * error: signing out twice is still signed out.
 *
 * @param tokenHash - SHA-256 hex digest of the session's token.
 */
export async function deleteAdminSession(tokenHash: string): Promise<void> {
  await execute(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash]);
}
