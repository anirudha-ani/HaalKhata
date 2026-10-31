/**
 * Sign-ins as a person sees them: each browser and phone is a session of its
 * own, listed in their settings, and any of them can be signed out without
 * touching the rest.
 */

import type { PoolClient } from "pg";
import { newId, transaction } from "@/server/common/db/db";
import { invalid, notFound } from "@/server/common/errors";
import { MAX_LISTED_SESSIONS, TOKEN_LIFETIME_SECONDS } from "@/server/auth/auth.constants";
import {
  deleteExpiredSessions,
  endOtherSessionRows,
  endSessionRow,
  insertSession,
  listLiveSessions,
  type SessionRow,
} from "@/server/auth/repo/sessions.repo";
import { removePushDevicesOfSessions } from "@/server/push/repo/pushDevices.repo";
import { OWN_SESSION_REFUSAL_MESSAGE } from "@haalkhata/shared/auth/sessions";
import type { DeviceDescription } from "./deviceLabel";
import { createToken } from "./session";

/**
 * Starts a session for somebody who has just proved who they are.
 *
 * @param user - The account.
 * @param device - What they signed in on.
 * @returns The session's token.
 */
export async function startSession(user: { id: string; token_version: number }, device: DeviceDescription): Promise<string> {
  await deleteExpiredSessions(user.id);
  const sessionId = newId();
  await insertSession({
    id: sessionId,
    userId: user.id,
    device: device.label,
    isApp: device.isApp,
    tokenVersion: user.token_version,
    lifetimeSeconds: TOKEN_LIFETIME_SECONDS,
  });
  return createToken(user.id, user.token_version, sessionId);
}

/**
 * Ends a session and stops pushes to the phone it was on, in one step: a phone
 * signed out must not go on showing the account on its lock screen.
 *
 * @param userId - Whose session.
 * @param sessionId - The session.
 * @param client - The transaction doing it.
 * @returns The session as it was, or undefined when it was not theirs or not live.
 */
async function endWithItsPushes(userId: string, sessionId: string, client: PoolClient): Promise<SessionRow | undefined> {
  const ended = await endSessionRow(userId, sessionId, client);
  if (ended) await removePushDevicesOfSessions(userId, [sessionId], ended.is_app, client);
  return ended;
}

/**
 * Ends the session a request came in on: signing out.
 *
 * @param userId - Authenticated caller.
 * @param sessionId - Their current session.
 */
export async function endCurrentSession(userId: string, sessionId: string): Promise<void> {
  await transaction((client) => endWithItsPushes(userId, sessionId, client));
}

/**
 * Everywhere a person is signed in.
 *
 * @param userId - Authenticated caller.
 * @param currentSessionId - The session asking.
 * @returns The ListSessionsResponse init shape.
 */
export async function listSessions(userId: string, currentSessionId: string) {
  const rows = await listLiveSessions(userId, MAX_LISTED_SESSIONS);
  return {
    sessions: rows.map((session) => ({
      id: session.id,
      device: session.device,
      isApp: session.is_app,
      signedInAt: new Date(session.created_at).toISOString(),
      lastUsedAt: new Date(session.last_used_at).toISOString(),
      current: session.id === currentSessionId,
    })),
  };
}

/**
 * Signs one other device or browser out. Its next request is refused, which
 * sends it to the login page.
 *
 * @param userId - Authenticated caller.
 * @param sessionId - The session to end.
 * @param currentSessionId - The session asking; signing out of this one goes
 *   through LogOut, which also clears its cookie.
 * @throws UsecaseError (invalid_argument) for the caller's own session;
 *   (not_found) when it is not a live session of theirs.
 */
export async function endSession(userId: string, sessionId: string, currentSessionId: string): Promise<void> {
  if (sessionId === currentSessionId) invalid(OWN_SESSION_REFUSAL_MESSAGE);
  const ended = await transaction((client) => endWithItsPushes(userId, sessionId, client));
  if (!ended) notFound("that device is already signed out");
}

/**
 * Signs out every device and browser but this one.
 *
 * @param userId - Authenticated caller.
 * @param currentSessionId - The session to leave alone.
 */
export async function endOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await transaction(async (client) => {
    const endedIds = await endOtherSessionRows(userId, currentSessionId, client);
    // Phones bound to no session go too: a phone signed out by this has none
    // yet. If this phone is one, it registers again when it next opens.
    await removePushDevicesOfSessions(userId, endedIds, true, client);
  });
}
