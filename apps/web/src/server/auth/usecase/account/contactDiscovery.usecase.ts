/** The caller's answer to "let people find me from their contacts". */

import { setContactDiscovery as storeContactDiscovery } from "@/server/auth/repo/users.repo";
import { getMe } from "@/server/auth/usecase/account/auth.usecase";

/**
 * Records whether people who hold the caller's verified phone number or
 * email can find them through FindContacts. Only the person can answer for
 * themselves: an account that never answered stays unfindable, which is how
 * every account that predates the feature starts.
 *
 * @param userId - Authenticated caller.
 * @param discoverable - True to be findable, false to stay hidden.
 * @returns The caller's refreshed profile, carrying the new answer.
 */
export async function setContactDiscovery(userId: string, discoverable: boolean) {
  await storeContactDiscovery(userId, discoverable);
  return getMe(userId);
}
