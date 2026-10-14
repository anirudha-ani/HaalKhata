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
  if [[ "$1" == "--import" && "$FAIL_AUTH_CHECK" == "1" ]]; then
    echo 'FAIL: test fixture has no Apple credentials'
    return 1
  fi
}
docker() { echo STEP:docker:$*; }
pnpm() { echo STEP:pnpm:$*; }
main "$@"
`;

/**
 * Executes the actual startup control flow with deterministic service substitutes.
 * @param {string[]} argumentsList Startup options.
 * @param {boolean} failAuth Whether the auth diagnostic fails.
 * @returns {string} Recorded workflow output.
 */
function startDevelopment(argumentsList = [], failAuth = false) {
  const result = spawnSync("bash", ["-c", STARTUP_HARNESS, "dev-startup-test", DEV_SCRIPT, ...argumentsList], {
    env: { ...process.env, FAIL_AUTH_CHECK: failAuth ? "1" : "0" }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout;
}

test("web startup prepares .env and checks Apple before starting the database or server", () => {
  const output = startDevelopment();
  assert.ok(output.indexOf("STEP:node:scripts/setup-env.mjs") < output.indexOf("STEP:node:--import tsx scripts/check-apple-auth.mts"));
  assert.ok(output.indexOf("STEP:node:--import tsx scripts/check-apple-auth.mts") < output.indexOf("STEP:database"));
  assert.ok(output.includes("local Apple configuration passed"));
  assert.ok(output.includes("scripts/next.mjs dev --turbopack -H 127.0.0.1"));
  assert.ok(!output.includes("check-apple-auth.mts --ios"));
});

test("iOS startup automatically selects the native Apple check", () => {
  const output = startDevelopment(["--mobile-ios"]);
  assert.ok(output.includes("STEP:node:--import tsx scripts/check-apple-auth.mts --ios"));
  assert.ok(output.indexOf("STEP:node:--import tsx scripts/check-apple-auth.mts --ios") < output.indexOf("STEP:mobile:ios"));
  assert.ok(output.includes("scripts/next.mjs dev --turbopack -H 0.0.0.0"));
});

test("Android startup checks the browser Apple flow", () => {
  const output = startDevelopment(["--mobile-android"]);
  assert.ok(output.includes("STEP:node:--import tsx scripts/check-apple-auth.mts"));
  assert.ok(!output.includes("check-apple-auth.mts --ios"));
  assert.ok(output.indexOf("STEP:node:--import tsx scripts/check-apple-auth.mts") < output.indexOf("STEP:mobile:android"));
});

test("missing optional Apple credentials are visible and do not prevent local startup", () => {
  const output = startDevelopment([], true);
  assert.ok(output.includes("Apple sign-in needs the configuration fixes shown above"));
  assert.ok(!output.includes("local Apple configuration passed"));
  assert.ok(output.includes("STEP:database"));
  assert.ok(output.includes("scripts/next.mjs dev"));
});

test("shutdown works without running setup or requiring authentication credentials", () => {
  const output = startDevelopment(["--down"], true);
  assert.ok(output.includes("STEP:docker:compose down --remove-orphans"));
  assert.ok(!output.includes("check-apple-auth.mts"));
  assert.ok(!output.includes("setup-env.mjs"));
  assert.ok(!output.includes("STEP:database"));
});
