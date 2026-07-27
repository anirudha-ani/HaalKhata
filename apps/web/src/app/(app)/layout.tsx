/** Authenticated app layout: redirects signed-out users to /login and wraps pages in AppShell. */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { sessionUser } from "@/lib/auth/session.server";

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
  const user = await sessionUser();
  if (!user) redirect("/login");
  // /onboarding lives outside this group precisely so this redirect cannot
  // loop. `onboarded` is stamped even when every field is skipped, so nobody
  // is sent back here twice.
  if (!user.onboarded) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
