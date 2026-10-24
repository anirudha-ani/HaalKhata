/** Tests that the page proxy routes by hostname: the admin page on its host, the app on its own, never crossed. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/**
 * Builds a page request for a hostname, as the proxy would receive it.
 *
 * @param host - The Host header.
 * @param pathname - The page path.
 * @param extraHeaders - Additional request headers, e.g. a prefetch marker.
 * @returns The request.
 */
function pageRequest(
  host: string,
  pathname: string,
  extraHeaders: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, { headers: { host, ...extraHeaders } });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_HOST", "admin.haalkhata.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("page proxy hostname routing", () => {
  it("serves the admin page on the admin host, under a nonce policy", () => {
    const response = proxy(pageRequest("admin.haalkhata.app", "/admin"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-");
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-nonce");
  });

  it("lets the admin host's root through to the route that redirects it, without rewriting", () => {
    const response = proxy(pageRequest("admin.haalkhata.app", "/"));

    expect(response.status).toBe(200);
    // A rewrite here is resolved against the server's bind address and can
    // leave the hostname; the redirect belongs to the root route.
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("answers 404 for every app page on the admin host", () => {
    for (const pathname of ["/dashboard", "/login", "/onboarding", "/join/some-token"]) {
      const response = proxy(pageRequest("admin.haalkhata.app", pathname));
      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("answers 404 for the admin page on the app host, without a redirect that would reveal it", () => {
    const response = proxy(pageRequest("haalkhata.app", "/admin"));

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("leaves the app's own pages untouched", () => {
    const response = proxy(pageRequest("haalkhata.app", "/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain("'nonce-");
  });

  it("applies the same routing to a prefetch, which carries no document to protect", () => {
    const prefetch = { "next-router-prefetch": "1" };

    expect(proxy(pageRequest("haalkhata.app", "/admin", prefetch)).status).toBe(404);
    expect(proxy(pageRequest("admin.haalkhata.app", "/login", prefetch)).status).toBe(404);

    const allowed = proxy(pageRequest("haalkhata.app", "/dashboard", prefetch));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("has no admin page on any host until one is configured", () => {
    vi.stubEnv("ADMIN_HOST", "");

    expect(proxy(pageRequest("haalkhata.app", "/admin")).status).toBe(404);
    expect(proxy(pageRequest("admin.haalkhata.app", "/admin")).status).toBe(404);
    expect(proxy(pageRequest("admin.haalkhata.app", "/dashboard")).status).toBe(200);
  });
});
