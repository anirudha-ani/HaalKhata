/** Root route: redirects to the admin page on the admin hostname, otherwise to /dashboard or /login based on session. */

import { redirect } from "next/navigation";
import { ADMIN_PAGE_PATH } from "@/config/adminSurface";
import { onAdminHost } from "@/lib/auth/adminSession.server";
import { sessionUserId } from "@/lib/auth/session.server";

/**
 * Server entry point for the root route; never renders UI, it only
 * redirects. On the admin hostname the only page is the admin page, so its
 * root goes there. Everywhere else it goes to /dashboard when a session
 * exists and to /login otherwise.
 *
 * @returns Never — always redirects.
 */
export default async function IndexPage() {
  if (await onAdminHost()) redirect(ADMIN_PAGE_PATH);
  redirect((await sessionUserId()) ? "/dashboard" : "/login");
}
