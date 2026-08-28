/** Security tests for browser session-cookie names and attributes. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_LIFETIME_SECONDS } from "@/server/auth/auth.constants";

describe("session cookies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses a browser-enforced host-only cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { SESSION_COOKIE, sessionCookieAttributes } = await import("./connect.constants");

    expect(SESSION_COOKIE).toBe("__Host-hk_token");
    expect(sessionCookieAttributes("signed-token", 60)).toBe(
      "__Host-hk_token=signed-token; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=60",
    );
  });

  it("keeps the unprefixed cookie for HTTP development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { SESSION_COOKIE, sessionCookieAttributes } = await import("./connect.constants");

    expect(SESSION_COOKIE).toBe("hk_token");
    expect(sessionCookieAttributes("signed-token", 60)).not.toContain("; Secure");
  });

  it("expires the cookie with the signed token", async () => {
    const { COOKIE_MAX_AGE } = await import("./connect.constants");

    expect(COOKIE_MAX_AGE).toBe(TOKEN_LIFETIME_SECONDS);
    expect(COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 7);
  });
});
