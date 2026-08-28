/** Server-component session helpers (App Router guards). */

import { cookies } from "next/headers";
import { sessionUser as resolveSessionUser } from "@/server/auth/usecase/auth.usecase";
import { SESSION_COOKIE } from "@/server/api/connect/connect.constants";

/**
 * Reads the session cookie and resolves it to the signed-in user.
 *
 * The token's embedded version is checked against the account, so a cookie
 * invalidated by signing out everywhere is rejected here rather than passing
 * the layout guard and then failing on every RPC inside the page it rendered.
 *
 * @returns The authenticated user in proto shape, or null when there is no
 *   valid session.
 */
export async function sessionUser() {
  const cookieStore = await cookies();
  const matchingCookies = cookieStore.getAll(SESSION_COOKIE);
  const token = matchingCookies.length === 1 ? matchingCookies[0]?.value : undefined;
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
