/** Vitest config: node-environment unit tests with the `@` → src alias. */

import path from "node:path";
import { defineConfig } from "vitest/config";

/** Vitest configuration: runs the `.test.ts` unit tests under `src/` in a node environment with the `@` → `src` path alias. */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
