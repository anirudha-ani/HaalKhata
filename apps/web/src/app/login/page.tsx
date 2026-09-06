/** /login route: public product landing page and authentication entry point. */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth/session.server";
import { LoginPage } from "./components/LoginPage/LoginPage";

/** Search and browser metadata for the public HaalKhata landing page. */
export const metadata: Metadata = {
  title: "Split expenses without the awkward math",
  description:
    "Scan receipts, split group expenses down to the cent, and keep a clear ledger with friends.",
};

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
