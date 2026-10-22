/** Runs local Expo commands with public configuration from the same root .env as Next.js. */

import { loadEnvironmentFile } from "../../../scripts/environment.mjs";

loadEnvironmentFile(undefined, { publicOnly: true });
await import("expo/bin/cli");
