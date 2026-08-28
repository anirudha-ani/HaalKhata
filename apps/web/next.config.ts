/** Next.js config: standalone output, workspace-package transpilation, server-external pg. */

import type { NextConfig } from "next";

/** Security headers that do not vary by runtime environment. */
const BASE_SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
];

/** CSP directives shared by production and development. */
const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
];

/**
 * Builds the application CSP. Next.js App Router currently requires inline
 * hydration scripts; development additionally needs eval-based source maps.
 * Google Identity Services and profile-image hosts are the only third parties.
 *
 * @param environment - Node environment used to select dev-only allowances.
 * @returns A semicolon-separated Content-Security-Policy value.
 */
export function contentSecurityPolicy(environment: string | undefined): string {
  const scriptSources = [
    "script-src 'self' 'unsafe-inline'",
    environment === "development" ? "'unsafe-eval'" : "",
    "https://accounts.google.com/gsi/client",
  ]
    .filter(Boolean)
    .join(" ");
  const directives = [...BASE_CSP_DIRECTIVES, scriptSources];
  if (environment === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/**
 * Next.js configuration: standalone output for the Docker image, transpiles
 * the raw-TypeScript workspace packages (protogen, shared), and keeps pg
 * packages external to the server bundle.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  // Don't announce the framework and version in a response header to every
  // scanner that asks. Costs nothing; removes one free hint for an attacker.
  poweredByHeader: false,
  transpilePackages: ["@haalkhata/protogen", "@haalkhata/shared"],
  // sharp is a native module (prebuilt .node binaries); bundling it breaks the
  // build, so it stays external and is required at runtime like pg.
  serverExternalPackages: ["pg", "node-pg-migrate", "sharp"],
  /** Ships baseline browser protections with every app deployment, independent of its proxy. */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...BASE_SECURITY_HEADERS,
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(process.env.NODE_ENV),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
