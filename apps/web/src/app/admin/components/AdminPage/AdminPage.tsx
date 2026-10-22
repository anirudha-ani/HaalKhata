"use client";
/** Admin page: the operator's sign-in, or the console (usage and reports) once signed in. */

import { useCallback, useState } from "react";
import { AdminConsole } from "./components/AdminConsole/AdminConsole";
import { AdminSignIn } from "./components/AdminSignIn/AdminSignIn";

/**
 * Renders one of the admin page's two states. Which one is known from the
 * server render (it read the session cookie) and changes here when the
 * operator signs in or out, or when the server reports the session has
 * ended.
 *
 * This component decides only what to draw. Whether the browser may see any
 * figures or reports is decided by the admin RPCs on every call.
 *
 * @param props - Component props.
 * @returns The sign-in or the console.
 */
export function AdminPage({
  initiallySignedIn,
  googleClientId,
}: {
  /**
   * Whether the request that rendered the page carried a live admin
   * session. Only the starting state: signing in or out afterwards happens
   * here, in the browser, without another page load.
   */
  initiallySignedIn: boolean;
  /** The OAuth client id Google's button is rendered for; "" when unconfigured. */
  googleClientId: string;
}) {
  const [isSignedIn, setSignedIn] = useState(initiallySignedIn);
  const [sessionEnded, setSessionEnded] = useState(false);

  const handleSignedIn = useCallback(() => {
    setSessionEnded(false);
    setSignedIn(true);
  }, []);
  // Stable, because the console and the dashboard call it from an effect.
  const handleSessionEnded = useCallback(() => {
    setSessionEnded(true);
    setSignedIn(false);
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {isSignedIn ? (
        <AdminConsole onSessionEnded={handleSessionEnded} />
      ) : (
        <AdminSignIn
          googleClientId={googleClientId}
          onSignedIn={handleSignedIn}
          sessionEnded={sessionEnded}
        />
      )}
    </main>
  );
}
