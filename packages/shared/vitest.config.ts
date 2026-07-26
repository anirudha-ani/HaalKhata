/** Vitest config: node-environment unit tests for the shared helpers. */

import { defineConfig } from "vitest/config";

/** Vitest configuration: runs the `.test.ts` unit tests under `src/` in a node environment. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
