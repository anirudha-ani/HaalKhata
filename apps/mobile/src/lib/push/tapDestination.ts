/** Where a tapped push should open, decided without React so it can be tested on its own. */

import { safeNotificationPath, type NotificationPath } from "@haalkhata/shared/navigation/activityPath";

/** The parts of a tapped push this decision reads. */
export interface TappedPush {
  /** expo-notifications' action identifier; the default one is a plain tap. */
  actionIdentifier: string;
  /** The push's data payload, untrusted. */
  data: Record<string, unknown> | undefined;
}

/**
 * Picks the screen a tap opens, or none.
 *
 * Only a plain tap navigates. A push addressed to another account — left in
 * Notification Center from before someone else signed in on this phone — is
 * ignored rather than opened in the wrong account. The link goes through the
 * same allowlist as the feed, plus Account.
 *
 * @param tapped - The tap.
 * @param defaultAction - The identifier of a plain tap.
 * @param signedInUserId - Who is signed in now.
 * @returns The route to open, or null to do nothing.
 */
export function tapDestination(
  tapped: TappedPush,
  defaultAction: string,
  signedInUserId: string,
): NotificationPath | null {
  if (tapped.actionIdentifier !== defaultAction) return null;
  const recipientId = tapped.data?.recipientId;
  if (typeof recipientId !== "string" || recipientId !== signedInUserId) return null;
  return safeNotificationPath(tapped.data?.link);
}
