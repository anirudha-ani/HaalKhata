/** Server-component helpers for the admin page: which surface a render is on, and whether an admin is signed in. */

import { headers } from "next/headers";
import { requestSurface } from "@/config/adminSurface";
import { uniqueCookieValue } from "@/server/api/connect/credentials";
import { ADMIN_SESSION_COOKIE } from "@/server/adminanalytics/adminanalytics.constants";
import { requireAdminSession } from "@/server/adminanalytics/usecase/adminSession.usecase";
import { UsecaseError } from "@/server/common/errors";

/**
 * Whether this render may show the admin page at all: true on the admin
 * hostname (and in development, where one host serves both), false on the
 * app's hostname.
 *
 * The proxy already answers 404 for the admin path on the app's hostname.
 * The page asks again because it is the thing being protected, and a guard
 * that lives only in front of it is one config change from not being there.
 *
 * @returns True when the request is on a surface that serves the admin page.
 */
export async function onAdminSurface(): Promise<boolean> {
  return requestSurface((await headers()).get("host")) !== "app";
}

/**
 * Whether the request carries a live admin session.
 *
 * Reads the raw Cookie header through the same duplicate-rejecting parser
 * the RPC path uses, for the reason given in session.server.ts: both guards
 * must give the same answer to the same request.
 *
 * Only decides which half of the page to render. The figures themselves are
 * fetched over the admin RPC, which checks the session again on every call.
 *
 * @returns True when an admin is signed in.
 * @throws Whatever the session lookup throws other than "not signed in": a
 *   database failure must surface, not render as a sign-in form.
 */
export async function adminSignedIn(): Promise<boolean> {
  const token = uniqueCookieValue((await headers()).get("cookie"), ADMIN_SESSION_COOKIE);
  try {
    await requireAdminSession(token);
    return true;
  } catch (error) {
    if (error instanceof UsecaseError && error.code === "unauthenticated") return false;
    throw error;
  }
}
