/** Vitest configuration: pure helpers and component tests against mocked native hosts. */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Native animation and haptics have no host in Node; these stand-ins
      // render through each test's react-native mock and do nothing else.
      "react-native-reanimated": fileURLToPath(new URL("./src/lib/testing/reanimatedStub.ts", import.meta.url)),
      "expo-haptics": fileURLToPath(new URL("./src/lib/testing/hapticsStub.ts", import.meta.url)),
      "expo-application": fileURLToPath(new URL("./src/lib/testing/applicationStub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
