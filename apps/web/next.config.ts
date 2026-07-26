/** Next.js config: standalone output, workspace-package transpilation, server-external pg. */

import type { NextConfig } from "next";

/**
 * Next.js configuration: standalone output for the Docker image, transpiles
 * the raw-TypeScript workspace packages (protogen, shared), and keeps pg
 * packages external to the server bundle.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@haalkhata/protogen", "@haalkhata/shared"],
  serverExternalPackages: ["pg", "node-pg-migrate"],
};

export default nextConfig;
