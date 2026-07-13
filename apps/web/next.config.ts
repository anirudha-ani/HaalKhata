/** Next.js config: standalone output, protogen transpilation, server-external pg. */

import type { NextConfig } from "next";

/**
 * Next.js configuration: standalone output for the Docker image, transpiles
 * the workspace protogen package, and keeps pg packages external to the
 * server bundle.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@haalkhata/protogen"],
  serverExternalPackages: ["pg", "node-pg-migrate"],
};

export default nextConfig;
