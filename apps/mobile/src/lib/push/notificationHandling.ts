/** App-wide handling of arriving notifications: show them in the foreground, label hidden previews, refresh data. */

import * as Notifications from "expo-notifications";
import type { QueryClient } from "@tanstack/react-query";
import { MONEY_KEYS } from "@haalkhata/shared/api/queryKeys";
import { PUSH_CATEGORIES } from "@haalkhata/shared/notifications/categories";
import { PUSH_PREVIEW_PLACEHOLDER } from "@haalkhata/shared/notifications/copy";

let installed = false;

/**
 * Installs the handlers once per process.
 *
 * - A handler states the foreground behaviour outright — banner and list
 *   entry with sound and badge — rather than leaning on the SDK default,
 *   which changed between SDK 57 (show nothing) and SDK 58 (show).
 * - One category per switch (plus "always") carries a placeholder iOS shows
 *   when the person hides previews, so a hidden push still says what it is.
 * - Each arriving push marks the money and feed queries stale, so the open
 *   screen catches up without waiting for the 30-second poll.
 *
 * @param queryClient - The app's query cache.
 */
export function installNotificationHandling(queryClient: QueryClient): void {
  if (installed) return;
  installed = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  for (const route of [...PUSH_CATEGORIES, "always" as const]) {
    void Notifications.setNotificationCategoryAsync(route, [], {
      previewPlaceholder: PUSH_PREVIEW_PLACEHOLDER[route],
    }).catch(() => undefined);
  }
  Notifications.addNotificationReceivedListener(() => {
    for (const queryKey of MONEY_KEYS) void queryClient.invalidateQueries({ queryKey });
  });
}
