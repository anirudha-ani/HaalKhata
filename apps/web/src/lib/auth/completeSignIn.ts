/** Browser session transition after a successful authentication RPC. */

import type { QueryClient } from "@tanstack/react-query";
import { clearAccountQueryCache } from "@/lib/api/queryCache";
import { nextPathFromLocation } from "@/lib/navigation/nextPath";

/**
 * Clears the previous account's data and loads the signed-in destination.
 * Connect sets the session cookie outside a Next.js Server Action, so the
 * App Router can still hold routes and redirects from the signed-out session.
 * A document navigation discards that router state and runs the destination's
 * session and onboarding guards with the new cookie. Replacing the history
 * entry also keeps Back from returning to the submitted sign-in form.
 *
 * @param queryClient - App-wide account query cache to clear before navigation.
 */
export function completeBrowserSignIn(queryClient: QueryClient): void {
  clearAccountQueryCache(queryClient);
  window.location.replace(nextPathFromLocation());
}
