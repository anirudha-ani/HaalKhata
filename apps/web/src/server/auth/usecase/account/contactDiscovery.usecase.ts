/** The caller's answer to "let people find me from their contacts". */

import { setContactDiscovery as storeContactDiscovery } from "@/server/auth/repo/users.repo";
import { getMe } from "@/server/auth/usecase/account/auth.usecase";

/**
 * Records whether people who hold the caller's verified phone number or
 * email can find them through FindContacts. Being findable is the default,
 * so an account that never answered can already be found; the answer
 * matters as a no (hidden from then on) and as a yes (the person has been
 * told, so neither app says it again).
 *
 * @param userId - Authenticated caller.
 * @param discoverable - True to be findable, false to stay hidden.
 * @returns The caller's refreshed profile, carrying the new answer.
 */
export async function setContactDiscovery(userId: string, discoverable: boolean) {
  await storeContactDiscovery(userId, discoverable);
  return getMe(userId);
}
