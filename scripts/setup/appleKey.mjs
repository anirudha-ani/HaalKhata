/** Maintains one ignored, owner-readable Apple key file for local development. */

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { APPLE_KEY_FILENAME, APPLE_KEY_PLACEHOLDER } from "./environment.constants.mjs";

/**
 * Creates a placeholder only when absent and points local configuration at the root file.
 * @param {string} directory Repository root, independent of the server's working directory.
 * @param {string} source Existing .env text, including any multiline secrets.
 * @returns {{text: string, needsKey: boolean}} Updated configuration and whether the user must paste a key.
 */
export function prepareAppleKey(directory, source) {
  const filename = resolve(directory, APPLE_KEY_FILENAME);
  if (!existsSync(filename)) writeFileSync(filename, APPLE_KEY_PLACEHOLDER, { mode: 0o600, flag: "wx" });
  chmodSync(filename, 0o600);
  const contents = readFileSync(filename, "utf8").trim();
  const needsKey = !contents || contents === APPLE_KEY_PLACEHOLDER.trim();
  if (parseEnv(source).APPLE_PRIVATE_KEY_FILE === APPLE_KEY_FILENAME) return { text: source, needsKey };
  // Append the effective assignment instead of rewriting comments or multiline credentials.
  const text = `${source}${source.endsWith("\n") ? "" : "\n"}\n# Managed by local setup: relative to the repository-root .env.\nAPPLE_PRIVATE_KEY_FILE=${APPLE_KEY_FILENAME}\n`;
  return { text, needsKey };
}
