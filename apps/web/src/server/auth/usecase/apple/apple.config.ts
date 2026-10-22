/** Validates the fixed browser callback for production and local HTTPS development. */

import { isIP } from "node:net";
import { UsecaseError } from "@/server/common/errors";
import { APPLE_CALLBACK_PATH } from "../../apple.constants";

/**
 * Builds Apple's registered callback without trusting request headers or falling back to production.
 * @returns The absolute callback URL at the explicitly configured HTTPS domain.
 */
export function appleBrowserCallbackUrl(): string {
  let origin: URL;
  try {
    origin = new URL(process.env.APP_PUBLIC_URL ?? "");
  } catch {
    throw new UsecaseError("unavailable", "Set APP_PUBLIC_URL to the registered HTTPS origin for Apple sign-in");
  }
  const hostname = origin.hostname.replace(/^\[|\]$/g, "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
      origin.search || origin.hash || isIP(hostname) || !hostname.includes(".") || hostname.endsWith(".localhost")) {
    throw new UsecaseError("unavailable", "Apple sign-in requires an HTTPS domain in APP_PUBLIC_URL; localhost and IP addresses are not supported");
  }
  return new URL(APPLE_CALLBACK_PATH, origin).href;
}
