/** /login route: redirects signed-in users to /dashboard, otherwise renders LoginPage. */

import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth/session.server";
import { LoginPage } from "./components/LoginPage/LoginPage";

/**
 * Server entry point for the /login route; sends users who already have a
 * session to /dashboard and shows the LoginPage to everyone else.
 *
 * @returns The login page element (or never, when redirecting).
 */
export default async function Login() {
  if (await sessionUserId()) redirect("/dashboard");
  return <LoginPage />;
}
