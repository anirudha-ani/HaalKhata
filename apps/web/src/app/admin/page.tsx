/** /admin route: the operator's usage overview, served only on the admin hostname. */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminSignedIn, onAdminSurface } from "@/lib/auth/adminSession.server";
import { AdminPage } from "./components/AdminPage/AdminPage";

/** Kept out of search results: this page is for one person. */
export const metadata: Metadata = {
  title: "Usage",
  robots: { index: false, follow: false },
};

/**
 * Server entry point for the admin page. Answers 404 on the app's hostname,
 * where this page does not exist, and otherwise mounts AdminPage telling it
 * whether an admin session is already live. Nothing about usage is rendered
 * here: the figures are fetched over the admin RPC, which checks the
 * session itself on every call.
 *
 * @returns The admin page element (or never, when the surface is wrong).
 */
export default async function Admin() {
  if (!(await onAdminSurface())) notFound();
  return <AdminPage initiallySignedIn={await adminSignedIn()} />;
}
