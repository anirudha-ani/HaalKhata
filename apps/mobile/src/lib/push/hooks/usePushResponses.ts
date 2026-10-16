/** Opens the right screen when a push is tapped, whether the app was running or not. */

import { useEffect, useRef } from "react";
import { useRouter, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { tapDestination } from "@/lib/push/tapDestination";

/**
 * Routes each tapped push once. The last response survives a cold start and a
 * sign-in in between, so a push tapped while signed out opens once the
 * person is back in — if it was meant for them.
 *
 * @param signedInUserId - Who is signed in; nothing routes until it is known.
 */
export function usePushResponses(signedInUserId: string | undefined): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!response || !signedInUserId) return;
    const identifier = response.notification.request.identifier;
    if (handled.current.has(identifier)) return;
    handled.current.add(identifier);
    const destination = tapDestination(
      {
        actionIdentifier: response.actionIdentifier,
        data: response.notification.request.content.data as Record<string, unknown> | undefined,
      },
      Notifications.DEFAULT_ACTION_IDENTIFIER,
      signedInUserId,
    );
    if (destination) router.push(destination as Href);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [response, router, signedInUserId]);
}
