/** Regressions for safe, repeatable public env setup and secret-free instructions. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { test } from "node:test";
import { manualEnvironmentActions, prefillEnvironment, setupEnvironment } from "./environment.mjs";
import { APPLE_KEY_FILENAME, APPLE_KEY_PLACEHOLDER, LOCAL_DATABASE_PASSWORD, SECRET_ENVIRONMENT_NAMES, SECRET_SECTION_HEADER } from "./environment.constants.mjs";

/** Real template ensures new clones get the configuration documented by the installer. */
const EXAMPLE = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

test("a fresh clone gets public IDs, the local database password, blank provider secrets and private files", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-setup-"));
  const messages = [];
  try {
    writeFileSync(join(directory, ".env.example"), EXAMPLE);
    setupEnvironment({ directory, report: (message) => messages.push(message) });
    const filename = join(directory, ".env");
    const configured = parseEnv(readFileSync(filename, "utf8"));
    assert.equal(configured.APPLE_TEAM_ID, "QL3M3QZSHQ");
    assert.equal(configured.APPLE_KEY_ID, "6XVYVH8478");
    assert.equal(configured.APPLE_SERVICE_ID, "com.haalkhata.web");
    assert.equal(configured.GOOGLE_CLIENT_ID, configured.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
    assert.ok(configured.GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com"));
    assert.equal(configured.GOOGLE_MOBILE_CLIENT_IDS, configured.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
    assert.equal(configured.POSTGRES_HOST, "localhost");
    for (const name of SECRET_ENVIRONMENT_NAMES) {
      if (name === "POSTGRES_PASSWORD") assert.equal(configured[name], LOCAL_DATABASE_PASSWORD);
      else assert.ok(!configured[name], `${name} must be supplied by the developer`);
      if (name !== "APPLE_PRIVATE_KEY") assert.ok(!configured[`${name}_FILE`]);
    }
    const keyFilename = join(directory, APPLE_KEY_FILENAME);
    assert.equal(configured.APPLE_PRIVATE_KEY_FILE, APPLE_KEY_FILENAME);
    assert.equal(readFileSync(keyFilename, "utf8"), APPLE_KEY_PLACEHOLDER);
    assert.equal(statSync(keyFilename).mode & 0o777, 0o600);
    assert.equal(statSync(filename).mode & 0o777, 0o600);
    const output = messages.join("\n");
    for (const name of ["POSTGRES_PASSWORD", "APPLE_PRIVATE_KEY_FILE", "APPLE_TOKEN_ENCRYPTION_KEY", "APP_PUBLIC_URL"]) {
      assert.ok(output.includes(name), `Setup must explain ${name}`);
    }
    assert.ok(output.includes("placeholder cannot authenticate"));
    const firstRun = readFileSync(filename, "utf8");
    const secretStart = firstRun.indexOf(SECRET_SECTION_HEADER);
    const ordinary = parseEnv(firstRun.slice(0, secretStart));
    const secrets = parseEnv(firstRun.slice(secretStart));
    assert.ok(secretStart >= 0);
    assert.ok(ordinary.GOOGLE_CLIENT_ID);
    assert.ok(!Object.hasOwn(ordinary, "POSTGRES_PASSWORD"));
    assert.ok(Object.hasOwn(secrets, "POSTGRES_PASSWORD"));
    assert.ok(!Object.hasOwn(secrets, "GOOGLE_CLIENT_ID"));
    setupEnvironment({ directory, report: () => {} });
    assert.equal(readFileSync(filename, "utf8"), firstRun);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("existing multiline secrets and comments survive verbatim while blank public values are filled once", () => {
  const source = '# Keep this comment\nAPPLE_PRIVATE_KEY="first line\nAPPLE_TEAM_ID=not-an-assignment\nlast line"\nSESSION_SECRET=private-value\nAPPLE_TOKEN_ENCRYPTION_KEY=keep-this-key\nAPPLE_TEAM_ID=\nGOOGLE_CLIENT_ID=""\n';
  const result = prefillEnvironment(source, EXAMPLE);
  assert.ok(result.text.startsWith(source));
  const configured = parseEnv(result.text);
  assert.equal(configured.APPLE_TEAM_ID, "QL3M3QZSHQ");
  assert.equal(configured.APPLE_PRIVATE_KEY, "first line\nAPPLE_TEAM_ID=not-an-assignment\nlast line");
  assert.equal(configured.APPLE_TOKEN_ENCRYPTION_KEY, "keep-this-key");
  assert.equal(configured.SESSION_SECRET, "private-value");
  assert.equal(configured.APPLE_PRIVATE_KEY_FILE, "");
  assert.equal(configured.POSTGRES_PASSWORD, LOCAL_DATABASE_PASSWORD);
  assert.deepEqual(prefillEnvironment(result.text, EXAMPLE), { text: result.text, filled: [] });
});

test("custom Google web IDs are propagated to the missing counterpart, never replaced by repository IDs", () => {
  for (const name of ["GOOGLE_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID"]) {
    const configured = parseEnv(prefillEnvironment(`${name}=custom-web-client\n`, EXAMPLE).text);
    assert.equal(configured.GOOGLE_CLIENT_ID, "custom-web-client");
    assert.equal(configured.NEXT_PUBLIC_GOOGLE_CLIENT_ID, "custom-web-client");
  }
});

test("blank local database passwords default to change-me while existing credentials remain untouched", () => {
  for (const password of ["", "   ", "change-me", "custom-local-password"]) {
    const configured = parseEnv(prefillEnvironment(`POSTGRES_PASSWORD="${password}"\n`, EXAMPLE).text);
    assert.equal(configured.POSTGRES_PASSWORD, password.trim() ? password : LOCAL_DATABASE_PASSWORD);
  }
  assert.throws(() => {
    const directory = mkdtempSync(join(tmpdir(), "haalkhata-setup-"));
    try {
      writeFileSync(join(directory, ".env.example"), `${EXAMPLE}\nPOSTGRES_PASSWORD=real-secret-not-a-default\n`);
      setupEnvironment({ directory, report: () => {} });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, /Remove POSTGRES_PASSWORD credentials/);
});

test("a different Apple team and native Google audience do not acquire unrelated provider IDs", () => {
  const configured = parseEnv(prefillEnvironment("APPLE_TEAM_ID=OTHERTEAM\nGOOGLE_MOBILE_CLIENT_IDS=custom-mobile\nSUPPORT_EMAIL=custom@example.com\n", EXAMPLE).text);
  assert.equal(configured.APPLE_TEAM_ID, "OTHERTEAM");
  assert.equal(configured.APPLE_KEY_ID, undefined);
  assert.equal(configured.APPLE_SERVICE_ID, undefined);
  assert.equal(configured.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, undefined);
  assert.equal(configured.GOOGLE_MOBILE_CLIENT_IDS, "custom-mobile");
  assert.equal(configured.SUPPORT_EMAIL, "custom@example.com");
});

test("secrets move to the bottom without changing their values or printing them", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-setup-"));
  const messages = [];
  try {
    writeFileSync(join(directory, ".env.example"), EXAMPLE);
    const filename = join(directory, ".env");
    const source = 'POSTGRES_PASSWORD=private-database-password\nDATABASE_URL=postgres://custom:private-database-password@localhost/custom\nAPPLE_PRIVATE_KEY_FILE=/private/key.p8\nAPPLE_TOKEN_ENCRYPTION_KEY_FILE=/private/encryption-key\nSESSION_SECRET=private-session-secret\n';
    writeFileSync(filename, source);
    chmodSync(filename, 0o644);
    setupEnvironment({ directory, report: (message) => messages.push(message) });
    const configured = parseEnv(readFileSync(filename, "utf8"));
    assert.equal(configured.APPLE_PRIVATE_KEY_FILE, APPLE_KEY_FILENAME);
    assert.equal(configured.APPLE_TOKEN_ENCRYPTION_KEY_FILE, "/private/encryption-key");
    assert.equal(configured.POSTGRES_PASSWORD, "private-database-password");
    assert.equal(configured.SESSION_SECRET, "private-session-secret");
    const output = messages.join("\n");
    for (const secret of ["private-database-password", "private-session-secret", "/private/key.p8", "/private/encryption-key"]) {
      assert.ok(!output.includes(secret));
    }
    assert.ok(!output.includes("set APPLE_PRIVATE_KEY_FILE"));
    assert.ok(!output.includes("paste the output into APPLE_TOKEN_ENCRYPTION_KEY"));
    assert.equal(statSync(filename).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pasted root keys survive reruns and stale paths are repaired for a server in apps/web", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata setup "));
  const messages = [];
  try {
    writeFileSync(join(directory, ".env.example"), EXAMPLE);
    setupEnvironment({ directory, report: () => {} });
    const keyFilename = join(directory, APPLE_KEY_FILENAME);
    const pastedContents = "developer-supplied-key-fixture\nsecond line\n";
    writeFileSync(keyFilename, pastedContents);
    chmodSync(keyFilename, 0o644);
    const filename = join(directory, ".env");
    writeFileSync(filename, `${readFileSync(filename, "utf8")}\nAPPLE_PRIVATE_KEY_FILE=/previous/checkout/AppleAuthKey.p8\n`);
    setupEnvironment({ directory, report: (message) => messages.push(message) });
    assert.equal(readFileSync(keyFilename, "utf8"), pastedContents);
    assert.equal(statSync(keyFilename).mode & 0o777, 0o600);
    assert.ok(!messages.join("\n").includes(pastedContents));
    assert.ok(!messages.join("\n").includes("replace ALL contents"));
    const repaired = readFileSync(filename, "utf8");
    const configured = parseEnv(repaired);
    assert.equal(configured.APPLE_PRIVATE_KEY_FILE, APPLE_KEY_FILENAME);
    const serverDirectory = join(directory, "apps/web");
    mkdirSync(serverDirectory, { recursive: true });
    const server = spawnSync(process.execPath, ["--input-type=module", "-e",
      'import { readFileSync } from "node:fs"; const { loadEnvironmentFile } = await import(process.argv[1]); const environment = {}; loadEnvironmentFile(process.argv[2], { environment }); if (readFileSync(environment.APPLE_PRIVATE_KEY_FILE, "utf8") !== process.argv[3]) process.exit(1);',
      new URL("../environment.mjs", import.meta.url).href, filename, pastedContents], { cwd: serverDirectory, encoding: "utf8" });
    assert.equal(server.status, 0, server.stderr);
    setupEnvironment({ directory, report: () => {} });
    assert.equal(readFileSync(filename, "utf8"), repaired);
    assert.equal(readFileSync(keyFilename, "utf8"), pastedContents);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("setup refuses a template containing secrets before creating an environment", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-setup-"));
  try {
    writeFileSync(join(directory, ".env.example"), `${EXAMPLE}\nAPPLE_TOKEN_ENCRYPTION_KEY=accidental-secret\n`);
    assert.throws(() => setupEnvironment({ directory, report: () => {} }), /Remove APPLE_TOKEN_ENCRYPTION_KEY credentials/);
    assert.ok(!existsSync(join(directory, APPLE_KEY_FILENAME)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("configured production callbacks still prompt for a local development URL", () => {
  const output = manualEnvironmentActions({ APP_PUBLIC_URL: "https://haalkhata.app" }).join("\n");
  assert.ok(output.includes("registered HTTPS development origin"));
});
