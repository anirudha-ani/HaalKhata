/** Tests for trusted-proxy and direct-socket client-IP resolution, and the network a rate limit counts. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { addressNetwork, clientIp, clientNetwork, DIRECT_CLIENT_IP_HEADER } from "./clientIp";

afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it("ignores caller-supplied proxy headers unless trust is explicitly enabled", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.50",
      "x-real-ip": "203.0.113.51",
      [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1",
    });

    expect(clientIp(headers)).toBe("127.0.0.1");
  });

  it("uses the proxy-overwritten first forwarded address when enabled", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.50, 10.0.0.2",
      [DIRECT_CLIENT_IP_HEADER]: "10.0.0.3",
    });

    expect(clientIp(headers)).toBe("203.0.113.50");
  });

  it("rejects arbitrary rate-limit keys even in trusted-proxy mode", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const headers = new Headers({
      "x-forwarded-for": "attacker-picked-bucket",
      [DIRECT_CLIENT_IP_HEADER]: "10.0.0.3",
    });

    expect(clientIp(headers)).toBe("10.0.0.3");
  });
});

describe("addressNetwork", () => {
  it("keeps an IPv4 address as it is", () => {
    expect(addressNetwork("203.0.113.50")).toBe("203.0.113.50");
  });

  it("counts every address of an IPv6 /64 as one, however it is written", () => {
    const sameConnection = [
      "2001:db8:1:2::1",
      "2001:0db8:0001:0002:ffff:ffff:ffff:ffff",
      "2001:DB8:1:2:a:b:c:d",
      "2001:db8:1:2:0:0:0:9%eth0",
    ];
    expect(new Set(sameConnection.map(addressNetwork))).toEqual(new Set(["2001:db8:1:2::/64"]));
    expect(addressNetwork("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(addressNetwork("::1")).toBe("0:0:0:0::/64");
  });

  it("counts an IPv4 address written as IPv6 as the IPv4 address", () => {
    expect(addressNetwork("::ffff:192.0.2.7")).toBe("192.0.2.7");
    expect(addressNetwork("::ffff:c000:207")).toBe("192.0.2.7");
  });

  it("leaves anything that is not an address alone", () => {
    expect(addressNetwork("unknown")).toBe("unknown");
  });

  it("is what a request's caller counts as", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    expect(clientNetwork(new Headers({ "x-forwarded-for": "2001:db8:1:2:dead:beef:0:1" }))).toBe("2001:db8:1:2::/64");
  });
});
