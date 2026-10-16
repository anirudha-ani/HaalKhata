/** Keeps the app icon's badge equal to the bell's unread count. */

import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useShellData } from "@/lib/hooks/useShellData";
import { usePushState } from "@/lib/push/pushStore";

/**
 * Sets the badge whenever the unread count changes — including to zero once
 * Activity marks everything read. Pushes carry the count too; this keeps the
 * icon right between pushes. Nothing happens without permission.
 */
export function useBadgeSync(): void {
  const { unreadCount } = useShellData();
  const { permission } = usePushState();
  useEffect(() => {
    if (permission !== "granted") return;
    void Notifications.setBadgeCountAsync(unreadCount).catch(() => false);
  }, [permission, unreadCount]);
}
