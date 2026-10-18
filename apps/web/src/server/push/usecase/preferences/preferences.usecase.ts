/** Which push categories the caller wants; one record for all of their phones. */

import { DEFAULT_PUSH_PREFERENCES, type PushPreferenceValues } from "@haalkhata/shared/notifications/categories";
import { toPushPreferenceValues } from "@haalkhata/shared/notifications/settings";
import { findPushPreferences, savePushPreferences } from "@/server/push/repo/pushPreferences.repo";

/**
 * The caller's switches; everything is on for an account that never chose.
 *
 * @param userId - Authenticated caller.
 * @returns The PushPreferences init shape.
 */
export async function getPreferences(userId: string): Promise<PushPreferenceValues> {
  const stored = await findPushPreferences(userId);
  return toPushPreferenceValues(stored ?? DEFAULT_PUSH_PREFERENCES);
}

/**
 * Replaces the caller's switches. A switch turned off applies to rows queued
 * before it, too: the dispatcher reads preferences when it sends.
 *
 * @param userId - Authenticated caller.
 * @param values - All five switches.
 * @returns What was stored.
 */
export async function updatePreferences(userId: string, values: PushPreferenceValues): Promise<PushPreferenceValues> {
  return toPushPreferenceValues(await savePushPreferences(userId, toPushPreferenceValues(values)));
}
