/** /admin route: the operator's usage overview and report queue, served only on the admin hostname. */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminSignedIn, onAdminSurface } from "@/lib/auth/adminSession.server";
import { adminEmails, adminGoogleClientId } from "@/server/adminanalytics/adminanalytics.constants";
import { AdminPage } from "./components/AdminPage/AdminPage";

/** Kept out of search results: this page is for one person. */
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Server entry point for the admin page. Answers 404 on the app's hostname,
 * where this page does not exist, and otherwise mounts AdminPage telling it
 * whether an admin session is already live. Nothing about usage or reports
 * is rendered here: both are fetched over the admin RPCs, which check the
 * session themselves on every call.
 *
 * The Google client id is handed down from here, read from the server's
 * environment at request time. The app's own sign-in gets its id from a
 * NEXT_PUBLIC_ variable inlined at build; doing the same for this page
 * would mean a second build argument for something only the server needs to
 * agree with itself about. Whether anyone is on the allowlist is handed down
 * too (never who), so an empty one is explained instead of tried.
 *
 * @returns The admin page element (or never, when the surface is wrong).
 */
export default async function Admin() {
  if (!(await onAdminSurface())) notFound();
  return (
    <AdminPage
      initiallySignedIn={await adminSignedIn()}
      googleClientId={adminGoogleClientId()}
      allowlistConfigured={adminEmails().size > 0}
    />
  );
}
