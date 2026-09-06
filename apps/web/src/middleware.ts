/** Per-request browser security policy for rendered application routes. */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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
 * Adds a unique nonce policy to both the request Next.js renders and the
 * response the browser enforces. Next.js reads the request policy and applies
 * its nonce to framework and hydration scripts automatically.
 *
 * @param request - Incoming application request.
 * @returns A continuation response carrying the request-specific CSP.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = createCspNonce();
  const policy = contentSecurityPolicy(process.env.NODE_ENV, nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

/** Applies nonce middleware only to rendered pages, excluding APIs, assets, and prefetches. */
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|favicon-32.png|apple-touch-icon.png|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
