/** Standalone entry point for the same local environment preparation used by install-deps.sh. */

import { setupEnvironment } from "./setup/environment.mjs";

try {
  setupEnvironment();
} catch (error) {
  console.error(`Environment setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
