/** Public sign-in availability, derived from usable server credentials without exposing them. */

import { APPLE_NATIVE_CLIENT_ID } from "../../apple.constants";
import { appleBrowserCallbackUrl } from "./apple.config";
import { assertAppleSignInConfigured } from "./apple.provider";

/**
 * Checks local signing/encryption without contacting Apple or issuing a challenge.
 * Missing, unreadable, placeholder or malformed credentials disable the optional provider.
 * @returns Native/browser availability flags for the two clients.
 */
export async function getSignInOptions() {
  try {
    await assertAppleSignInConfigured(APPLE_NATIVE_CLIENT_ID);
  } catch {
    return { appleNativeEnabled: false, appleBrowserEnabled: false };
  }
  try {
    if (!process.env.APPLE_SERVICE_ID?.trim()) return { appleNativeEnabled: true, appleBrowserEnabled: false };
    appleBrowserCallbackUrl();
    return { appleNativeEnabled: true, appleBrowserEnabled: true };
  } catch {
    return { appleNativeEnabled: true, appleBrowserEnabled: false };
  }
}
