/** Applies local migrations before dev.sh starts Next.js or native development services. */

import { loadEnvironmentFile } from "../../../scripts/environment.mjs";
import { ensureMigrated } from "../src/server/common/db/db";

loadEnvironmentFile();

try {
  await ensureMigrated();
} catch (error) {
  console.error(`Database migrations failed: ${error instanceof Error ? error.message : "unknown database error"}`);
  process.exitCode = 1;
}
