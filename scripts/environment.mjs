/** Loads the repository environment while keeping server secrets out of Expo's process. */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

/** Shared development configuration, resolved independently of the caller's working directory. */
export const ROOT_ENVIRONMENT_PATH = resolve(import.meta.dirname, "../.env");

/**
 * Loads missing environment values; explicit shell variables always win, including empty values.
 * @param {string} filename Environment file; an absent file is valid for CI and EAS.
 * @param {{ publicOnly?: boolean, environment?: Record<string, string | undefined> }} options Expo filtering and optional test environment.
 */
export function loadEnvironmentFile(filename = ROOT_ENVIRONMENT_PATH, { publicOnly = false, environment = process.env } = {}) {
  if (!existsSync(filename)) return;
  const values = parseEnv(readFileSync(filename, "utf8"));
  for (const [name, value] of Object.entries(values)) {
    if ((!publicOnly || name.startsWith("EXPO_PUBLIC_")) && environment[name] === undefined) {
      environment[name] = value;
    }
  }
}
