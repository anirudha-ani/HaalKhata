/** Trusted client-IP resolution for authentication rate-limit keys. */

import network from "node:net";

/** Header overwritten by the Next mount from the request socket address. */
export const DIRECT_CLIENT_IP_HEADER = "x-haalkhata-peer-ip";

/**
 * Resolves the client IP without trusting caller-controlled proxy headers by
 * default. `TRUST_PROXY_HEADERS=true` is a deployment assertion that the
 * front proxy overwrites X-Forwarded-For/X-Real-IP before forwarding.
 *
 * @param headers - Connect request headers, including the mount-injected peer.
 * @returns A validated IP literal, or "unknown" when none is trustworthy.
 */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (forwarded && network.isIP(forwarded) !== 0) return forwarded;
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp && network.isIP(realIp) !== 0) return realIp;
  }

  const directIp = headers.get(DIRECT_CLIENT_IP_HEADER)?.trim();
  return directIp && network.isIP(directIp) !== 0 ? directIp : "unknown";
}
