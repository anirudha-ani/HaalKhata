/** Tracks verified simulator/emulator installations against Expo's native fingerprint. */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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

/**
 * Records only a binary built from a stable native input snapshot.
 * @param {string} filename Installation-specific record.
 * @param {string} before Fingerprint captured immediately before compilation.
 * @param {string} after Fingerprint checked after compilation and installation.
 * @returns {void} Throws instead of certifying edits made during a build.
 */
export function recordCompletedBuild(filename, before, after) {
  if (!before || before !== after) throw new Error("Native inputs changed during the build. Rerun ./dev.sh to rebuild them.");
  verifyBuildRecord(filename, before, true);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [action, platform, installation, before] = process.argv.slice(2);
  if (!["check", "record", "fingerprint"].includes(action)) throw new Error("Expected check, record or fingerprint");
  const fingerprint = await nativeFingerprint(platform);
  if (action === "fingerprint") console.log(fingerprint);
  else {
    const filename = buildRecordPath(join(MOBILE_ROOT, ".expo/native-builds"), platform, installation);
    if (action === "record") recordCompletedBuild(filename, before, fingerprint);
    else console.log(verifyBuildRecord(filename, fingerprint) ? "current" : "rebuild");
  }
}
