"use client";
/** Admin page: the operator's sign-in, or the usage dashboard once signed in. */

import { useCallback, useState } from "react";
import { AdminSignIn } from "./components/AdminSignIn/AdminSignIn";
import { UsageDashboard } from "./components/UsageDashboard/UsageDashboard";

/**
 * Renders one of the admin page's two states. Which one is known from the
 * server render (it read the session cookie) and changes here when the
 * operator signs in or out, or when the server reports the session has
 * ended.
 *
 * This component decides only what to draw. Whether the browser may see any
 * figures is decided by the admin RPC on every call.
 *
 * @param props - Component props.
 * @returns The sign-in or the dashboard.
 */
export function AdminPage({
  initiallySignedIn,
}: {
  /**
   * Whether the request that rendered the page carried a live admin
   * session. Only the starting state: signing in or out afterwards happens
   * here, in the browser, without another page load.
   */
  initiallySignedIn: boolean;
}) {
  const [isSignedIn, setSignedIn] = useState(initiallySignedIn);
  const [sessionEnded, setSessionEnded] = useState(false);

  const handleSignedIn = useCallback(() => {
    setSessionEnded(false);
    setSignedIn(true);
  }, []);
  // Stable, because the dashboard calls it from an effect.
  const handleSessionEnded = useCallback(() => {
    setSessionEnded(true);
    setSignedIn(false);
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {isSignedIn ? (
        <UsageDashboard onSessionEnded={handleSessionEnded} />
      ) : (
        <AdminSignIn onSignedIn={handleSignedIn} sessionEnded={sessionEnded} />
      )}
    </main>
  );
}
