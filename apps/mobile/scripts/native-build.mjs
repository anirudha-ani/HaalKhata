/** Tracks verified simulator/emulator installations against Expo's native fingerprint. */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvironmentFile } from "../../../scripts/environment.mjs";

/** Mobile project directory, independent of the invoking shell's working directory. */
const MOBILE_ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Resolve the fingerprint API bundled with the installed Expo SDK. */
const require = createRequire(import.meta.url);

/**
 * Hashes the native dependencies, config plugins, assets and generated native project.
 * @param {"ios" | "android"} platform Target native platform.
 * @returns {Promise<string>} Expo compatibility fingerprint, with no environment values printed.
 */
export async function nativeFingerprint(platform) {
  if (!["ios", "android"].includes(platform)) throw new Error("Expected ios or android");
  loadEnvironmentFile(undefined, { publicOnly: true });
  const { createProjectHashAsync } = require("expo/fingerprint");
  return createProjectHashAsync(MOBILE_ROOT, { platforms: [platform], silent: true });
}

/**
 * Locates a build record for this exact installed binary, not just its bundle ID.
 * @param {string} directory Private local build-record directory.
 * @param {"ios" | "android"} platform Target platform.
 * @param {string} installation iOS app container, or Android serial plus package update time.
 * @returns {string} Installation-specific record path.
 */
export function buildRecordPath(directory, platform, installation) {
  if (!installation) throw new Error("Cannot verify the installed development client");
  let identity = installation;
  if (platform === "ios") {
    const information = statSync(join(installation, "Info.plist"));
    identity += `:${information.ino}:${information.ctimeMs}:${information.mtimeMs}`;
  }
  const digest = createHash("sha256").update(identity).digest("hex");
  return join(directory, `${platform}-${digest}.txt`);
}

/**
 * Checks or records a successfully installed development build.
 * @param {string} filename Installation-specific record.
 * @param {string} fingerprint Current native compatibility hash.
 * @param {boolean} record Whether native build and installation have both succeeded.
 * @returns {boolean} Whether this installation is verified for the current native project.
 */
export function verifyBuildRecord(filename, fingerprint, record = false) {
  if (record) {
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, `${fingerprint}\n`, { mode: 0o600 });
    return true;
  }
  try { return readFileSync(filename, "utf8").trim() === fingerprint; }
  catch (failure) {
    if (failure.code === "ENOENT") return false;
    throw failure;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, platform, installation] = process.argv.slice(2);
  if (!["check", "record"].includes(action)) throw new Error("Expected check or record");
  const fingerprint = await nativeFingerprint(platform);
  const filename = buildRecordPath(join(MOBILE_ROOT, ".expo/native-builds"), platform, installation);
  const current = verifyBuildRecord(filename, fingerprint, action === "record");
  if (action === "check") console.log(current ? "current" : "rebuild");
}
