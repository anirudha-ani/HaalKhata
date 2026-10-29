/** Leaves the welcome screen once a session exists: for a waiting invitation, or Home. */

import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/api/session";
import { consumePendingInvite } from "@/lib/invite/consumePendingInvite";

/**
 * The one place that moves a signed-in person off the welcome screen. A
 * sign-in started here sets the session and leaves the rest to this; so does
 * somebody who arrives here already signed in, who used to be shown the
 * sign-in buttons again. Either way they go where a waiting invitation
 * says, or Home.
 *
 * It leaves once per visit. The saved invitation is taken as it is read, so
 * a second departure (a renewed token, a remount) would find none and send
 * the person Home over the top of the invitation.
 *
 * @returns True while the screen should show nothing but a spinner: the
 *   saved session is still being read, or there is one and the screen is
 *   leaving.
 */
export function useLeaveWhenSignedIn(): boolean {
  const session = useSession();
  const router = useRouter();
  const leaving = useRef(false);
  const signedIn = session.hydrated && session.token !== null;

  useEffect(() => {
    if (!signedIn || leaving.current) return;
    leaving.current = true;
    void consumePendingInvite()
      // A saved invitation that cannot be read is no reason to keep a
      // signed-in person on the welcome screen.
      .catch(() => "/dashboard")
      .then((destination) => router.replace(destination));
  }, [signedIn, router]);

  return !session.hydrated || signedIn;
}
