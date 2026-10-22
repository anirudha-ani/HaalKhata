"use client";
/** Admin console state: which view is showing, the report queue behind its switch, and sign-out. */

import { useState } from "react";
import { errorMessage } from "@/lib/api/connect";
import { DEFAULT_ADMIN_VIEW, type AdminView } from "../constants/adminPage";
import { reportsTabLabel } from "../utils/reportsTabLabel";
import { useAdminModerationAPI } from "./useAdminModerationAPI";
import { useAdminSessionAPI } from "./useAdminSessionAPI";
import { useSessionEndWatch } from "./useSessionEndWatch";

/**
 * Holds what the signed-in admin page needs above its two views.
 *
 * The report queue is loaded here rather than in its view, so the switch
 * can say how much is waiting while the usage view is showing. It is one
 * small read, and the queue view uses the same one.
 *
 * @param options - Hook options.
 * @param options.onSessionEnded - Called when the session is over, by
 *   sign-out or by the server's say-so.
 * @returns The view and its setter, the switch's options, the moderation
 *   API for the queue view, and sign-out with its state.
 */
export function useAdminConsole({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [view, setView] = useState<AdminView>(DEFAULT_ADMIN_VIEW);
  const signOut = useAdminSessionAPI({ onSignedOut: onSessionEnded });
  const moderation = useAdminModerationAPI();
  useSessionEndWatch([moderation.query.error, moderation.perform.error], onSessionEnded);

  const queue = moderation.query.data;
  const views: readonly { value: AdminView; label: string }[] = [
    { value: "usage", label: "Usage" },
    {
      value: "reports",
      label: reportsTabLabel(queue?.reports.length ?? 0, queue?.reportsTruncated ?? false),
    },
  ];

  return {
    view,
    setView,
    views,
    moderation,
    signOut: () => signOut.mutate(),
    isSigningOut: signOut.isPending,
    signOutError: signOut.error ? errorMessage(signOut.error) : "",
  };
}
