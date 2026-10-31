"use client";
/** Holds a page on sign-out until the server has ended the session. */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Code, ConnectError } from "@connectrpc/connect";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/api/connect";
import { clearAccountQueryCache } from "@/lib/api/queryCache";
import { forgetSignOut, isSignOutPending, subscribeToSignOut, watchSession } from "@/lib/auth/signOut";
import { SIGN_OUT_RETRY_INTERVAL_MS } from "../constants/signOutGate";

/**
 * Asks the server to end the session, and leaves for the login page once it
 * has. "Unauthenticated" counts: the session is already over, which is all
 * signing out wanted. Anything else leaves it alive, and the login page would
 * only send a live session straight back here, so the page stays and says so.
 *
 * @returns Whether it could not be finished.
 */
async function endSession(): Promise<boolean> {
  try {
    await authClient.logOut({});
  } catch (failure) {
    if (!(failure instanceof ConnectError && failure.code === Code.Unauthenticated)) return true;
  }
  forgetSignOut();
  window.location.replace("/login");
  return false;
}

/**
 * Watches for a sign-out from this tab or another, or a session the server
 * has refused. The moment one starts the account's data goes; the session
 * follows when the server answers, retried on a timer and when the browser
 * comes back online.
 *
 * @returns `pending`, whether to keep the page away; `failed`, whether the
 *   server could not be reached; and `retry`, to try again now.
 */
export function useSignOutGate() {
  const queryClient = useQueryClient();
  const pending = useSyncExternalStore(subscribeToSignOut, isSignOutPending, () => false);
  const [failed, setFailed] = useState(false);

  const retry = useCallback(async () => setFailed(await endSession()), []);

  useEffect(() => watchSession(), []);

  useEffect(() => {
    if (!pending) return undefined;
    clearAccountQueryCache(queryClient);
    void endSession().then(setFailed);
    const timer = setInterval(() => void retry(), SIGN_OUT_RETRY_INTERVAL_MS);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [pending, queryClient, retry]);

  return { pending, failed, retry };
}
