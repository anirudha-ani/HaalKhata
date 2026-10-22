/** Standalone entry point for the same local environment preparation used by install-deps.sh. */

import { setupEnvironment } from "./setup/environment.mjs";
import { assertDevelopmentDatabasePassword } from "./setup/development.mjs";
import { loadEnvironmentFile } from "./environment.mjs";

/** Normal startup prepares files quietly; installation retains the manual setup checklist. */
const developmentStartup = process.argv.includes("--dev");

try {
  setupEnvironment({ report: developmentStartup ? () => {} : console.log });
  if (developmentStartup) {
    loadEnvironmentFile();
    assertDevelopmentDatabasePassword(process.env);
  }
} catch (error) {
  console.error(`Environment setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
