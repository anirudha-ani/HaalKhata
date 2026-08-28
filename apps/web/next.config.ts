/** Next.js config: standalone output, workspace-package transpilation, server-external pg. */

import type { NextConfig } from "next";

/** Security headers that do not vary by runtime environment. */
const BASE_SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
];

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
        headers: BASE_SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
