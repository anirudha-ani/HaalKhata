/** Starts Next.js with the repository environment loaded before its workers spawn. */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

/** Shared root environment used by the host server and Compose development stack. */
const environmentPath = resolve(import.meta.dirname, "../../../.env");

if (existsSync(environmentPath)) loadEnvFile(environmentPath);

// Next forwards CLI flags to workers; Node's --env-file flags are forbidden
// there. Loading through the API keeps configuration available to every worker.
await import("next/dist/bin/next");
