/** Secret values from files (the Docker `_FILE` convention) or, failing that, the environment. */

import fileSystem from "node:fs";

/**
 * Reads one secret by name. `<NAME>_FILE`, when set, names a file whose
 * trimmed contents are the value — the convention the official postgres and
 * mysql images use for Docker secrets — and takes precedence over `<NAME>`
 * in the environment, which stays supported for development and tests.
 *
 * Reading the file directly is what keeps the value out of the process
 * environment: an exported variable is visible to every child process,
 * `/proc/<pid>/environ`, crash dumps and any diagnostic that prints the
 * environment, none of which need it.
 *
 * @param name - Environment variable name, e.g. "SESSION_SECRET".
 * @returns The secret, or "" when neither the file nor the variable is set.
 * @throws Error when `<NAME>_FILE` names a file that cannot be read — a
 *   misconfiguration to fail loudly on, not to fall back from.
 */
export function readSecret(name: string): string {
  const filePath = process.env[`${name}_FILE`];
  if (filePath) {
    try {
      return fileSystem.readFileSync(filePath, "utf8").trim();
    } catch (error) {
      throw new Error(
        `${name}_FILE names ${filePath}, which could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return process.env[name] ?? "";
}
