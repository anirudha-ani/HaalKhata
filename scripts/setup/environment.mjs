/** Prepares local public configuration and reports manual inputs without exposing secrets. */

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { APPLE_IDENTITY_NAMES, APPLE_KEY_FILENAME, LOCAL_DATABASE_PASSWORD, PUBLIC_ENVIRONMENT_NAMES, SECRET_ENVIRONMENT_NAMES } from "./environment.constants.mjs";
import { prepareAppleKey } from "./appleKey.mjs";
import { groupSecretSection } from "./secretSection.mjs";

/** Repository root shared by install-deps.sh and the standalone setup command. */
const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");

/**
 * Selects known defaults while respecting provider accounts already chosen locally.
 * @param {Record<string, string>} existing Parsed current environment.
 * @param {Record<string, string>} template Parsed public example configuration.
 * @returns {Record<string, string>} Defaults safe to add to missing/blank entries.
 */
function publicDefaults(existing, template) {
  const defaults = Object.fromEntries(PUBLIC_ENVIRONMENT_NAMES.map((name) => [name, template[name] ?? ""]));
  const webClient = existing.GOOGLE_CLIENT_ID?.trim() || existing.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (webClient) defaults.GOOGLE_CLIENT_ID = defaults.NEXT_PUBLIC_GOOGLE_CLIENT_ID = webClient;

  if (APPLE_IDENTITY_NAMES.some((name) => existing[name] && existing[name] !== template[name])) {
    for (const name of APPLE_IDENTITY_NAMES) defaults[name] = "";
  }

  const nativeNames = ["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID"];
  if (existing.GOOGLE_MOBILE_CLIENT_IDS) {
    const accepted = existing.GOOGLE_MOBILE_CLIENT_IDS.split(",").map((value) => value.trim());
    for (const name of nativeNames) if (!accepted.includes(defaults[name])) defaults[name] = "";
  }
  defaults.GOOGLE_MOBILE_CLIENT_IDS = nativeNames.map((name) => existing[name] || defaults[name]).filter(Boolean).join(",");
  return defaults;
}

/**
 * Fills public values and the local database default; existing credentials stay intact.
 * @param {string} source Existing .env text.
 * @param {string} example Repository template text.
 * @returns {{ text: string, filled: string[] }} Updated text and the names filled.
 */
export function prefillEnvironment(source, example) {
  const existing = parseEnv(source);
  const template = parseEnv(example);
  const defaults = publicDefaults(existing, template);
  const filled = PUBLIC_ENVIRONMENT_NAMES.filter((name) => !existing[name]?.trim() && defaults[name]);
  if (!existing.POSTGRES_PASSWORD?.trim()) {
    defaults.POSTGRES_PASSWORD = LOCAL_DATABASE_PASSWORD;
    filled.push("POSTGRES_PASSWORD");
  }
  const blankSecrets = Object.keys(template).filter((name) =>
    !Object.hasOwn(existing, name) && template[name] === "" &&
    SECRET_ENVIRONMENT_NAMES.includes(name.replace(/_FILE$/, "")));
  if (!filled.length && !blankSecrets.length) return { text: source, filled };
  // Appending overrides an earlier blank assignment without rewriting any secret.
  // Both Node's dotenv parser and Compose use the last assignment for a name.
  const additions = [];
  if (filled.length) additions.push("# Known local defaults added by setup; earlier blank entries are overridden.",
    ...filled.map((name) => `${name}=${JSON.stringify(defaults[name])}`));
  if (blankSecrets.length) additions.push("# Fill these secrets yourself (or use the supported _FILE alternative).",
    ...blankSecrets.map((name) => `${name}=`));
  return { text: `${source}${source.endsWith("\n") ? "" : "\n"}\n${additions.join("\n")}\n`, filled };
}

/**
 * Describes missing secrets and machine-specific settings using names, never values.
 * @param {Record<string, string>} configured Parsed local environment.
 * @returns {string[]} Actions the developer still owns.
 */
export function manualEnvironmentActions(configured) {
  const actions = [];
  if (!configured.APPLE_PRIVATE_KEY && !configured.APPLE_PRIVATE_KEY_FILE) {
    actions.push(`Apple sign-in: run local setup to point APPLE_PRIVATE_KEY_FILE at root ${APPLE_KEY_FILENAME}, then replace that file's placeholder with your original .p8 key contents.`);
  }
  if (!configured.APPLE_TOKEN_ENCRYPTION_KEY && !configured.APPLE_TOKEN_ENCRYPTION_KEY_FILE) {
    actions.push("Apple sign-in: run openssl rand -hex 32 once and paste the output into APPLE_TOKEN_ENCRYPTION_KEY, or set APPLE_TOKEN_ENCRYPTION_KEY_FILE. Retain that key for this database.");
  }
  const missingAppleIds = APPLE_IDENTITY_NAMES.filter((name) => !configured[name]);
  if (missingAppleIds.length) actions.push(`Apple account: fill ${missingAppleIds.join(", ")} for your chosen developer account.`);
  if (!configured.APP_PUBLIC_URL || configured.APP_PUBLIC_URL === "https://haalkhata.app") {
    actions.push("Browser/Android Apple sign-in: set APP_PUBLIC_URL to your registered HTTPS development origin and register /api/auth/apple/callback there. Set EXPO_PUBLIC_API_URL to that origin to use the same local backend on a device.");
  }
  if (!configured.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
    actions.push("Android Google sign-in (when testing Android): supply its client ID in EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID and include it in GOOGLE_MOBILE_CLIENT_IDS.");
  }
  if (!configured.COMPATIBLE_AI_API_KEY && !configured.COMPATIBLE_AI_API_KEY_FILE) {
    actions.push("Optional real receipt AI: fill COMPATIBLE_AI_API_KEY yourself; the local mock provider is available without it.");
  }
  if (!configured.ADMIN_EMAILS?.trim()) {
    actions.push("Optional admin page (/admin, usage and reports): put your Google address in ADMIN_EMAILS, then restart the dev server. Blank means nobody can sign in there.");
  }
  if (!configured.TWILIO_API_KEY_SECRET && !configured.TWILIO_API_KEY_SECRET_FILE) {
    actions.push("Optional phone verification: fill TWILIO_API_KEY_SID, TWILIO_VERIFY_SERVICE_SID and TWILIO_API_KEY_SECRET yourself.");
  }
  return actions;
}

/**
 * Prepares .env and its canonical Apple key placeholder without generating credentials.
 * @param {{directory?: string, report?: (message: string) => void}} options Repository directory and output sink.
 * @returns {void}
 */
export function setupEnvironment({ directory = REPOSITORY_ROOT, report = console.log } = {}) {
  const filename = resolve(directory, ".env");
  const example = readFileSync(resolve(directory, ".env.example"), "utf8");
  const template = parseEnv(example);
  for (const name of SECRET_ENVIRONMENT_NAMES) {
    const localPassword = name === "POSTGRES_PASSWORD" && template[name] === LOCAL_DATABASE_PASSWORD;
    if ((template[name] && !localPassword) || template[`${name}_FILE`]) throw new Error(`Remove ${name} credentials from .env.example before setup.`);
  }
  const exists = existsSync(filename);
  const source = exists ? readFileSync(filename, "utf8") : example;
  const result = prefillEnvironment(source, example);
  const appleKey = prepareAppleKey(directory, result.text);
  const prepared = groupSecretSection(appleKey.text);
  if (!exists || prepared !== source) writeFileSync(filename, prepared, { mode: 0o600, flag: exists ? "w" : "wx" });
  chmodSync(filename, 0o600);
  report(exists ? "Updated .env; Apple key path managed, other existing values and secrets preserved." : "Created .env with local defaults and an Apple key path; private provider secrets are blank.");
  report(result.filled.length ? `Prefilled: ${result.filled.join(", ")}.` : "Known public defaults are already present; no configured values were replaced.");
  report("Secret fields are grouped at the bottom of .env under 'Secrets (fill these in)'.");
  report("POSTGRES_PASSWORD uses the local development default when blank; existing passwords are preserved.");
  report(`APPLE_PRIVATE_KEY_FILE points to root ${APPLE_KEY_FILENAME}; existing file contents are never overwritten.`);
  if (appleKey.needsKey) report(`- Apple sign-in: replace ALL contents of root ${APPLE_KEY_FILENAME} with your original downloaded .p8 key, including its BEGIN/END PRIVATE KEY lines. The placeholder cannot authenticate.`);
  for (const action of manualEnvironmentActions(parseEnv(prepared))) report(`- ${action}`);
  report("SESSION_SECRET is optional in development: the server keeps a local key automatically. Production requires your own configured secret.");
  report("Run ./dev.sh to start the app. Apple sign-in stays hidden until configured; pnpm auth:check is an optional diagnostic when setting it up. See docs/local-auth.md.");
}
