/** Server-component session helper (App Router guards). */

import { cookies } from "next/headers";
import { verifyToken } from "@/server/auth/usecase/auth.usecase";
import { SESSION_COOKIE } from "@/server/api/connect/connect.constants";

/**
 * Reads the session cookie and resolves it to the signed-in user's id.
 *
 * @returns The authenticated user's id, or `null` when there is no valid session.
 */
export async function sessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}
