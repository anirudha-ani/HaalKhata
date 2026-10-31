/** All SQL for user_sessions: one row per sign-in, on a browser or a phone. */

import type { PoolClient } from "pg";
import { execute, query, queryOne } from "@/server/common/db/db";
import type { SessionStanding } from "@/server/auth/usecase/session/session";

/** One row of user_sessions. */
export interface SessionRow {
  id: string;
  user_id: string;
  device: string;
  is_app: boolean;
  token_version: number;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  ended_at: string | null;
}

/**
 * Reads what decides whether a session is live, in one statement: this runs on
 * every authenticated request.
 *
 * @param userId - The token's user.
 * @param sessionId - The token's session.
 * @returns The session's standing, or undefined when the account is gone or suspended.
 */
export async function findSessionStanding(userId: string, sessionId: string): Promise<SessionStanding | undefined> {
  return queryOne<SessionStanding>(
    `SELECT usr.token_version,
            usr.legacy_sessions_ended,
            session.id IS NOT NULL AS session_found,
            session.ended_at IS NOT NULL AS session_ended
       FROM users usr
       LEFT JOIN user_sessions session ON session.id = $2 AND session.user_id = usr.id
      WHERE usr.id = $1 AND usr.suspended_at IS NULL`,
    [userId, sessionId],
  );
}

/**
 * Stores a sign-in. Writing the same id twice changes nothing, which is what
 * lets several requests carrying one older token arrive at the same row. Does
 * nothing for an account deleted meanwhile.
 *
 * @param session - Its id, owner, device, token version and lifetime.
 * @param client - Transaction client; omitted, the pool.
 */
export async function insertSession(
  session: { id: string; userId: string; device: string; isApp: boolean; tokenVersion: number; lifetimeSeconds: number },
  client?: PoolClient,
): Promise<void> {
  await execute(
    `INSERT INTO user_sessions (id, user_id, device, is_app, token_version, expires_at)
     SELECT $1, usr.id, $3, $4, $5, now() + make_interval(secs => $6)
       FROM users usr WHERE usr.id = $2
     ON CONFLICT (id) DO NOTHING`,
    [session.id, session.userId, session.device, session.isApp, session.tokenVersion, session.lifetimeSeconds],
    client,
  );
}

/**
 * Marks a session used and extends it, when it renews: at most once a day.
 *
 * @param sessionId - The session.
 * @param lifetimeSeconds - How long from now it lasts.
 */
export async function touchSession(sessionId: string, lifetimeSeconds: number): Promise<void> {
  await execute(
    `UPDATE user_sessions
        SET last_used_at = now(), expires_at = now() + make_interval(secs => $2)
      WHERE id = $1 AND ended_at IS NULL`,
    [sessionId, lifetimeSeconds],
  );
}

/**
 * Removes a person's sessions that ran out by themselves. Called on sign-in,
 * so the table stays the size of the devices people really have.
 *
 * @param userId - The person.
 */
export async function deleteExpiredSessions(userId: string): Promise<void> {
  await execute(`DELETE FROM user_sessions WHERE user_id = $1 AND expires_at <= now()`, [userId]);
}

/**
 * A person's live sessions, most recently used first. A row from before their
 * account's token version moved (a suspension) is over, though nobody ended it.
 *
 * @param userId - The person.
 * @param limit - The most to return.
 * @returns The rows.
 */
export async function listLiveSessions(userId: string, limit: number): Promise<SessionRow[]> {
  return query<SessionRow>(
    `SELECT session.*
       FROM user_sessions session
       JOIN users usr ON usr.id = session.user_id
      WHERE session.user_id = $1
        AND session.ended_at IS NULL
        AND session.expires_at > now()
        AND session.token_version = usr.token_version
      ORDER BY session.last_used_at DESC, session.created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
}

/**
 * Ends one of a person's sessions.
 *
 * @param userId - Whose: a session of anybody else's is left alone.
 * @param sessionId - The session.
 * @param client - The transaction doing it.
 * @returns The session as it was, or undefined when it was not theirs or not live.
 */
export async function endSessionRow(userId: string, sessionId: string, client: PoolClient): Promise<SessionRow | undefined> {
  return queryOne<SessionRow>(
    `UPDATE user_sessions SET ended_at = now()
      WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
      RETURNING *`,
    [sessionId, userId],
    client,
  );
}

/**
 * Ends all of a person's sessions but one, and older tokens that have no row
 * yet with them.
 *
 * @param userId - The person.
 * @param keepSessionId - The session to leave alone.
 * @param client - The transaction doing it.
 * @returns The ids of the sessions it ended.
 */
export async function endOtherSessionRows(userId: string, keepSessionId: string, client: PoolClient): Promise<string[]> {
  await execute(`UPDATE users SET legacy_sessions_ended = true WHERE id = $1`, [userId], client);
  const rows = await query<{ id: string }>(
    `UPDATE user_sessions SET ended_at = now()
      WHERE user_id = $1 AND id <> $2 AND ended_at IS NULL
      RETURNING id`,
    [userId, keepSessionId],
    client,
  );
  return rows.map((session) => session.id);
}
