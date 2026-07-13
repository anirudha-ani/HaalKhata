/** Vitest configuration: unit tests for pure (non-React-Native) helpers only. */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
