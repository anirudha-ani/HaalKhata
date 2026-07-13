/** Authenticated app layout: redirects signed-out users to /login and wraps pages in AppShell. */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { sessionUserId } from "@/lib/auth/session.server";

/**
 * Layout for every authenticated (app) route: redirects to /login when there
 * is no session, otherwise wraps the page in the AppShell chrome (navigation,
 * header).
 *
 * @param props - Layout props.
 * @param props.children - The routed page content to render inside the shell.
 * @returns The AppShell-wrapped page for signed-in users.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await sessionUserId())) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
