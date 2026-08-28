/** Regressions for application-owned browser security headers. */

import { describe, expect, it } from "vitest";
import nextConfig, { contentSecurityPolicy } from "../../next.config";

describe("web security headers", () => {
  it("applies the complete baseline to every route", async () => {
    if (!nextConfig.headers) throw new Error("security headers must be configured");
    const routes = await nextConfig.headers();
    const headers = Object.fromEntries(routes[0].headers.map(({ key, value }) => [key, value]));

    expect(routes[0].source).toBe("/(.*)");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("keeps production strict while allowing Next development source maps", () => {
    const productionPolicy = contentSecurityPolicy("production");
    const developmentPolicy = contentSecurityPolicy("development");

    expect(productionPolicy).not.toContain("'unsafe-eval'");
    expect(productionPolicy).toContain("upgrade-insecure-requests");
    expect(developmentPolicy).toContain("'unsafe-eval'");
    expect(developmentPolicy).not.toContain("upgrade-insecure-requests");
  });

  it("allows only the third parties required by Google sign-in and avatars", () => {
    const policy = contentSecurityPolicy("production");

    expect(policy).toContain("https://accounts.google.com/gsi/client");
    expect(policy).toContain("https://accounts.google.com/gsi/style");
    expect(policy).toContain("https://*.googleusercontent.com");
    expect(policy).toContain("object-src 'none'");
  });
});
