/** Per-request routing by hostname and browser security policy for rendered application routes. */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_PAGE_PATH, pageVerdict } from "@/config/adminSurface";
import { contentSecurityPolicy } from "@/config/securityHeaders";

/** Number of random bytes used for each one-time CSP nonce. */
const CSP_NONCE_BYTE_LENGTH = 16;

/**
 * Generates a 128-bit nonce encoded as Base64 for a single response.
 *
 * @returns A cryptographically random CSP nonce.
 */
export function createCspNonce(): string {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(CSP_NONCE_BYTE_LENGTH));
  return btoa(String.fromCharCode(...nonceBytes));
}

/**
 * Whether the router is fetching a page ahead of a navigation rather than
 * rendering a document. A prefetch carries no document for a CSP to govern.
 *
 * @param request - Incoming application request.
 * @returns True for a router or browser prefetch.
 */
function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch"
  );
}

/**
 * Routes a page request by the hostname it arrived on, then adds a unique
 * nonce policy to both the request Next.js renders and the response the
 * browser enforces. Next.js reads the request policy and applies its nonce
 * to framework and hydration scripts automatically.
 *
 * The hostname decision comes first and covers every page request,
 * prefetches included: the admin hostname serves the admin page and nothing
 * else, and the app's hostname has no admin page (see config/adminSurface).
 * The admin page checks its own surface again when it renders, so this is
 * the first gate and not the only one.
 *
 * @param request - Incoming application request.
 * @returns A 404, or a continuation response carrying the request-specific CSP.
 */
export function proxy(request: NextRequest): NextResponse {
  const verdict = pageVerdict(request.nextUrl.pathname, request.headers.get("host"));
  if (verdict === "not-found") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const adminPage =
    verdict === "rewrite-to-admin" ? new URL(ADMIN_PAGE_PATH, request.url) : null;

  if (isPrefetch(request)) {
    return adminPage ? NextResponse.rewrite(adminPage) : NextResponse.next();
  }

  const nonce = createCspNonce();
  const policy = contentSecurityPolicy(process.env.NODE_ENV, nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const forwarded = { request: { headers: requestHeaders } };
  const response = adminPage
    ? NextResponse.rewrite(adminPage, forwarded)
    : NextResponse.next(forwarded);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

/**
 * Runs the proxy for rendered pages, excluding APIs and static assets.
 * Prefetches are included so the hostname routing above applies to them
 * too; they skip the nonce work inside the function instead.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|favicon-32.png|apple-touch-icon.png|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js).*)",
  ],
};
