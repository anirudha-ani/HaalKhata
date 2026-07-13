/** Root route: redirects to /dashboard or /login based on session. */

import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth/session.server";

/**
 * Server entry point for the root route; never renders UI, it only redirects
 * to /dashboard when a session exists and to /login otherwise.
 *
 * @returns Never — always redirects.
 */
export default async function IndexPage() {
  redirect((await sessionUserId()) ? "/dashboard" : "/login");
}
