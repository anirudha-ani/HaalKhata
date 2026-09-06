/** Server-component session helpers (App Router guards). */

import { headers } from "next/headers";
import { sessionUser as resolveSessionUser } from "@/server/auth/usecase/auth.usecase";
import { sessionTokenFromCookieHeader } from "@/server/api/connect/credentials";

/**
 * Reads the session cookie and resolves it to the signed-in user.
 *
 * The token's embedded version is checked against the account, so a cookie
 * invalidated by signing out everywhere is rejected here rather than passing
 * the layout guard and then failing on every RPC inside the page it rendered.
 *
 * The raw Cookie header goes through the same parser the RPC path uses, not
 * `cookies()` from next/headers: that store is a Map keyed by name, so a
 * duplicated session cookie silently collapses to whichever value was parsed
 * last and the "reject duplicates" rule Connect applies could never fire
 * here. Both guards must give the same answer to the same request.
 *
 * @returns The authenticated user in proto shape, or null when there is no
 *   valid session.
 */
export async function sessionUser() {
  const token = sessionTokenFromCookieHeader((await headers()).get("cookie"));
  if (!token) return null;
  return resolveSessionUser(token);
}

/**
 * Reads the session cookie and resolves it to the signed-in user's id.
 *
 * @returns The authenticated user's id, or `null` when there is no valid session.
 */
export async function sessionUserId(): Promise<string | null> {
  return (await sessionUser())?.id ?? null;
}
