/** Keeps the tab's Apple verifier and the callback on the same browser origin. */

/**
 * Refuses a redirect that would strand sessionStorage proof on another origin.
 * @param authorizationUrl Apple authorization URL returned by the server.
 * @param currentOrigin Origin of the initiating browser tab.
 */
export function assertAppleBrowserOrigin(authorizationUrl: string, currentOrigin: string): void {
  const callback = new URL(new URL(authorizationUrl).searchParams.get("redirect_uri") ?? "");
  if (callback.origin !== currentOrigin) {
    throw new Error(`Open ${callback.origin}/login to continue with Apple. Sign-in must start and finish on the same site.`);
  }
}
