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
  // sharp is a native module (prebuilt .node binaries); bundling it breaks the
  // build, so it stays external and is required at runtime like pg.
  serverExternalPackages: ["pg", "node-pg-migrate", "sharp"],
};

export default nextConfig;
