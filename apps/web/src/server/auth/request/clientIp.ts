/** Trusted client-IP resolution, and the network rate limits count a caller as. */

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

/**
 * The network rate limits count an address as. An IPv4 address is itself.
 * An IPv6 address is its /64: one home or phone connection is handed a /64
 * — some 18 quintillion addresses — and can send every request from a new
 * one, so counting addresses would let one caller look like millions. An
 * IPv4 address written as IPv6 (`::ffff:192.0.2.7`) counts as that IPv4
 * address.
 *
 * @param address - A client address, as {@link clientIp} returns it.
 * @returns The IPv4 address, the IPv6 /64 as `2001:db8:1:2::/64`, or the
 *   input unchanged when it is not an IP literal ("unknown").
 */
export function addressNetwork(address: string): string {
  const withoutZone = address.split("%")[0];
  if (network.isIPv4(withoutZone)) return withoutZone;
  if (!network.isIPv6(withoutZone)) return address;
  // The URL parser writes an IPv6 address in its one canonical short form,
  // embedded IPv4 included, so only the "::" needs expanding.
  const canonical = new URL(`http://[${withoutZone}]/`).hostname.slice(1, -1);
  const [head, tail] = canonical.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? headGroups
      : [...headGroups, ...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups];
  const mappedIpv4 = groups.slice(0, 5).every((group) => group === "0") && groups[5] === "ffff";
  if (mappedIpv4) {
    const [highHalf, lowHalf] = [Number.parseInt(groups[6], 16), Number.parseInt(groups[7], 16)];
    return [highHalf >> 8, highHalf & 255, lowHalf >> 8, lowHalf & 255].join(".");
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/**
 * The caller's network, for keying a per-address rate limit.
 *
 * @param headers - Connect request headers, including the mount-injected peer.
 * @returns See {@link addressNetwork}.
 */
export function clientNetwork(headers: Headers): string {
  return addressNetwork(clientIp(headers));
}
