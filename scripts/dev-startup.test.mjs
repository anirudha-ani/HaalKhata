/** Exercises real dev.sh orchestration without starting Docker, Metro, or a web server. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/** Sourceable startup script; the tests replace only side-effecting service adapters. */
const DEV_SCRIPT = fileURLToPath(new URL("../dev.sh", import.meta.url));
/** Shell harness records the selected checks and service order without changing .env. */
const STARTUP_HARNESS = `
uname() { echo Linux; }
source "$1"
shift
uname() { echo Darwin; }
assert_system_ready() { echo STEP:prerequisites; }
ensure_project_state() { echo STEP:dependencies; }
start_db() { echo STEP:database; }
start_mobile() { echo STEP:mobile:$1; }
node() {
  echo STEP:node:$*
  if [[ "$1" == "scripts/setup-env.mjs" && "$FAIL_ENV_SETUP" == "1" ]]; then
    echo 'Set POSTGRES_PASSWORD in the Secrets section at the bottom of .env'
    return 1
  fi
}
docker() { echo STEP:docker:$*; }
pnpm() {
  echo STEP:pnpm:$*
  if [[ "$*" == *"scripts/prepare-database.mts"* && "$FAIL_MIGRATIONS" == "1" ]]; then
    echo 'Not run migration release_change is preceding already run migration main_change' >&2
    return 1
  fi
}
main "$@"
`;

/**
 * Executes the actual startup control flow with deterministic service substitutes.
 * @param {string[]} argumentsList Startup options.
 * @param {boolean} failSetup Whether required database setup fails.
 * @param {boolean} failMigrations Whether the database migration command fails.
 * @returns {string} Recorded workflow output.
 */
function startDevelopment(argumentsList = [], failSetup = false, failMigrations = false) {
  const result = spawnSync("bash", ["-c", STARTUP_HARNESS, "dev-startup-test", DEV_SCRIPT, ...argumentsList], {
    env: { ...process.env, FAIL_ENV_SETUP: failSetup ? "1" : "0", FAIL_MIGRATIONS: failMigrations ? "1" : "0" }, encoding: "utf8",
  });
  const fails = (failSetup || failMigrations) && !argumentsList.includes("--down");
  assert.equal(result.status, fails ? 1 : 0, result.stderr);
  if (!failMigrations || argumentsList.includes("--down")) assert.equal(result.stderr, "");
  return result.stdout + result.stderr;
}

test("web startup quietly prepares .env without running optional Apple diagnostics", () => {
  const output = startDevelopment();
  assert.ok(output.indexOf("STEP:node:scripts/setup-env.mjs --dev") < output.indexOf("STEP:database"));
  assert.ok(output.includes("scripts/next.mjs dev --turbopack -H 127.0.0.1"));
  assert.ok(!output.includes("check-apple-auth.mts"));
  assert.ok(!output.includes("Apple"));
  assert.ok(output.indexOf("STEP:database") < output.indexOf("scripts/prepare-database.mts"));
  assert.ok(output.indexOf("database migrations passed") < output.indexOf("scripts/next.mjs dev"));
});

for (const platform of ["ios", "android"]) {
  test(`${platform} startup starts native services without requiring Apple credentials`, () => {
    const output = startDevelopment([`--mobile-${platform}`]);
    assert.ok(output.indexOf("STEP:node:scripts/setup-env.mjs --dev") < output.indexOf(`STEP:mobile:${platform}`));
    assert.ok(!output.includes("check-apple-auth.mts"));
    assert.ok(output.includes("scripts/next.mjs dev --turbopack -H 0.0.0.0"));
    assert.ok(output.indexOf("database migrations passed") < output.indexOf(`STEP:mobile:${platform}`));
  });
}

test("missing database credentials stop before Compose and name the exact field to fill", () => {
  const output = startDevelopment([], true);
  assert.ok(output.includes("Set POSTGRES_PASSWORD in the Secrets section"));
  assert.ok(!output.includes("STEP:database"));
  assert.ok(!output.includes("scripts/next.mjs dev"));
});

for (const argumentsList of [[], ["--mobile-ios"], ["--mobile-android"]]) {
  test(`migration failures stop startup before web/mobile: ${argumentsList.join(" ") || "web"}`, () => {
    const output = startDevelopment(argumentsList, false, true);
    assert.ok(output.includes("preceding already run migration"));
    assert.ok(output.includes("database migrations failed; web and mobile startup stopped"));
    assert.ok(!output.includes("database migrations passed"));
    assert.ok(!output.includes("scripts/next.mjs dev"));
    assert.ok(!output.includes("STEP:mobile:"));
  });
}

test("shutdown works without running setup or requiring authentication credentials", () => {
  const output = startDevelopment(["--down"], true, true);
  assert.ok(output.includes("STEP:docker:compose down --remove-orphans"));
  assert.ok(!output.includes("check-apple-auth.mts"));
  assert.ok(!output.includes("setup-env.mjs"));
  assert.ok(!output.includes("STEP:database"));
  assert.ok(!output.includes("scripts/prepare-database.mts"));
});
