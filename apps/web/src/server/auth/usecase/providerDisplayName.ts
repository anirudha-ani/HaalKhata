/** Publishable display names from external identity providers. */

import { UsecaseError } from "@/server/common/errors";
import { assertSafeText } from "@/server/safety/usecase/contentFilter";
import { MAX_USER_NAME_LENGTH, PROVIDER_NAME_FALLBACK } from "../auth.constants";

/**
 * Bounds and filters provider names without making an account inaccessible.
 * @param rawName Verified provider profile name or untrusted Apple first-use name.
 * @returns A publishable name, with a neutral fallback for empty or abusive text.
 */
export function providerDisplayName(rawName: string): string {
  const name = rawName.trim().slice(0, MAX_USER_NAME_LENGTH);
  if (!name) return PROVIDER_NAME_FALLBACK;
  try {
    assertSafeText(name);
    return name;
  } catch (error) {
    if (error instanceof UsecaseError && error.code === "invalid_argument") return PROVIDER_NAME_FALLBACK;
    throw error;
  }
}
