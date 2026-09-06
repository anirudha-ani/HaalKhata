/** Tests for trusted-proxy and direct-socket client-IP resolution. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, DIRECT_CLIENT_IP_HEADER } from "./clientIp";

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
