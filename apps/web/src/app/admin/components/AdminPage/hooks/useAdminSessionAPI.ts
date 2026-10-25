"use client";
/** Admin session API: ending the operator's session. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminAnalyticsClient } from "@/lib/api/connect";
import { forgetAdminData } from "../utils/forgetAdminData";

/**
 * Signs the operator out.
 *
 * Everything the page cached is forgotten once the server confirms the
 * session is gone. When the server could not end it, nothing is forgotten
 * and nothing changes: the operator is still signed in, is told so, and can
 * try again.
 *
 * @param options - Hook options.
 * @param options.onSignedOut - Called once the server has ended the session.
 * @returns The sign-out mutation.
 */
export function useAdminSessionAPI({ onSignedOut }: { onSignedOut: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminAnalyticsClient.signOut({}),
    onSuccess: () => {
      forgetAdminData(queryClient);
      onSignedOut();
    },
  });
}
