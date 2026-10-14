/** Starts Next.js with the repository environment loaded before its workers spawn. */

import { loadEnvironmentFile } from "../../../scripts/environment.mjs";

loadEnvironmentFile();

// Next forwards CLI flags to workers; Node's --env-file flags are forbidden
// there. Loading through the API keeps configuration available to every worker.
await import("next/dist/bin/next");
