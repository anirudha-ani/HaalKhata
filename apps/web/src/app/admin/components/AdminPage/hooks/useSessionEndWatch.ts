"use client";
/** Turns the server saying "your admin session is over" into the sign-in form. */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { forgetAdminData } from "../utils/forgetAdminData";
import { isSessionEnded } from "../utils/isSessionEnded";

/**
 * Watches failures for the one that means the admin session is over, and
 * when it comes, forgets everything the page cached and hands over to the
 * sign-in.
 *
 * An ended session is not an error to read; it is a reason to sign in. The
 * cache goes first: its figures and reported words must not outlive the
 * session, and its error must not be the first thing the next session reads.
 *
 * @param errors - The latest failure of each query or mutation watched;
 *   null where there is none.
 * @param onSessionEnded - Called once when the session is found to be over.
 * @returns Whether any of them means the session ended.
 */
export function useSessionEndWatch(
  errors: readonly unknown[],
  onSessionEnded: () => void,
): boolean {
  const queryClient = useQueryClient();
  const sessionEnded = errors.some(isSessionEnded);
  useEffect(() => {
    if (!sessionEnded) return;
    forgetAdminData(queryClient);
    onSessionEnded();
  }, [sessionEnded, queryClient, onSessionEnded]);
  return sessionEnded;
}
