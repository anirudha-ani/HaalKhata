/** Regressions for application-owned browser security headers. */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../next.config";
import { createCspNonce, middleware } from "../middleware";
import { contentSecurityPolicy } from "./securityHeaders";

describe("web security headers", () => {
  it("applies the complete baseline to every route", async () => {
    if (!nextConfig.headers) throw new Error("security headers must be configured");
    const routes = await nextConfig.headers();
    const headers = Object.fromEntries(routes[0].headers.map(({ key, value }) => [key, value]));

    expect(routes[0].source).toBe("/(.*)");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("uses one request nonce without permitting arbitrary inline scripts", () => {
    const productionPolicy = contentSecurityPolicy("production", "request-nonce");

    expect(productionPolicy).toContain("'nonce-request-nonce'");
    expect(productionPolicy).toContain("'strict-dynamic'");
    expect(productionPolicy).toContain("script-src-attr 'none'");
    expect(productionPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("keeps production strict while allowing Next development source maps", () => {
    const productionPolicy = contentSecurityPolicy("production", "production-nonce");
    const developmentPolicy = contentSecurityPolicy("development", "development-nonce");

    expect(productionPolicy).not.toContain("'unsafe-eval'");
    expect(productionPolicy).toContain("upgrade-insecure-requests");
    expect(developmentPolicy).toContain("'unsafe-eval'");
    expect(developmentPolicy).not.toContain("upgrade-insecure-requests");
  });

  it("allows only the third parties required by Google sign-in and avatars", () => {
    const policy = contentSecurityPolicy("production", "request-nonce");

    expect(policy).toContain("https://accounts.google.com/gsi/client");
    expect(policy).toContain("https://accounts.google.com/gsi/style");
    expect(policy).toContain("https://*.googleusercontent.com");
    expect(policy).toContain("object-src 'none'");
  });

  it("generates a fresh 128-bit nonce for each rendered response", () => {
    const firstNonce = createCspNonce();
    const secondNonce = createCspNonce();

    expect(firstNonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(secondNonce).not.toBe(firstNonce);

    const response = middleware(new NextRequest("https://haalkhata.example/login"));
    const responsePolicy = response.headers.get("Content-Security-Policy");
    const forwardedNonce = response.headers.get("x-middleware-request-x-nonce");

    expect(responsePolicy).toContain(`'nonce-${forwardedNonce}'`);
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-nonce");
  });
});
