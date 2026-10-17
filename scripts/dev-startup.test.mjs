/** Exercises real dev.sh orchestration without starting Docker, Metro, or a web server. */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/** Sourceable startup script; the tests replace only side-effecting external adapters. */
const DEV_SCRIPT = fileURLToPath(new URL("../dev.sh", import.meta.url));
/** Shell harness records the selected checks and service order without changing .env. */
const STARTUP_HARNESS = `
uname() { echo Linux; }
source "$1"
shift
uname() { echo Darwin; }
assert_system_ready() { echo STEP:prerequisites; }
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
  if [[ "$1" == "install" && "$FAIL_INSTALL" == "1" ]]; then
    echo 'Lockfile does not match the workspace manifests' >&2
    return 1
  fi
  if [[ "$1" == "gen" && "$FAIL_GENERATION" == "1" ]]; then
    echo 'Invalid protobuf contract' >&2
    return 1
  fi
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
 * @param {{setup?: boolean, migrations?: boolean, install?: boolean, generation?: boolean}} failures Failing external adapters.
 * @param {{webLock?: object, expectedStatus?: number}} options Next's dev-server lock to leave in
 *   the checkout, and the exit status the run must end with when it is not decided by `failures`.
 * @returns {string} Recorded workflow output.
 */
function startDevelopment(argumentsList = [], failures = {}, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata startup "));
  try {
    // Reproduce a partially installed checkout after pulling a new API domain:
    // root/web modules exist, mobile has no Expo package, and protogen is nonempty.
    for (const folder of ["scripts", "node_modules", "apps/web/node_modules", "apps/mobile/node_modules", "packages/protogen/src/auth/v1"]) {
      mkdirSync(join(directory, folder), { recursive: true });
    }
    copyFileSync(DEV_SCRIPT, join(directory, "dev.sh"));
    copyFileSync(new URL("./macos-env.sh", import.meta.url), join(directory, "scripts/macos-env.sh"));
    writeFileSync(join(directory, "packages/protogen/src/auth/v1/auth_pb.ts"), "// Old generated contract; safety API is missing.\n");
    if (options.webLock) {
      mkdirSync(join(directory, "apps/web/.next/dev"), { recursive: true });
      writeFileSync(join(directory, "apps/web/.next/dev/lock"), JSON.stringify(options.webLock));
    }
    const result = spawnSync("bash", ["-c", STARTUP_HARNESS, "dev-startup-test", join(directory, "dev.sh"), ...argumentsList], {
      env: { ...process.env, FAIL_ENV_SETUP: failures.setup ? "1" : "0", FAIL_MIGRATIONS: failures.migrations ? "1" : "0",
        FAIL_INSTALL: failures.install ? "1" : "0", FAIL_GENERATION: failures.generation ? "1" : "0" }, encoding: "utf8",
    });
    const fails = Object.values(failures).some(Boolean) && !argumentsList.includes("--down");
    const expectedStatus = options.expectedStatus ?? (fails ? 1 : 0);
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    if (expectedStatus === 0 && (!fails || failures.setup)) assert.equal(result.stderr, "");
    return result.stdout + result.stderr;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const argumentsList of [[], ["--mobile-ios"], ["--mobile-android"]]) {
  test(`partial dependencies and stale generated APIs are repaired before services: ${argumentsList.join(" ") || "web"}`, () => {
    const output = startDevelopment(argumentsList);
    const install = output.indexOf("STEP:pnpm:install --frozen-lockfile");
    const generate = output.indexOf("STEP:pnpm:gen");
    assert.ok(install >= 0, "Existing root/web folders must not skip workspace installation");
    assert.ok(generate > install, "Existing generated files must not skip regeneration after installing tools");
    assert.ok(output.indexOf("STEP:node:scripts/setup-env.mjs") > generate);
    assert.ok(output.indexOf("STEP:database") > generate);
  });
}

for (const failure of ["install", "generation"]) {
  test(`${failure} errors stop startup before database, Metro or web`, () => {
    const output = startDevelopment(["--mobile-ios"], { [failure]: true });
    assert.ok(output.includes(failure === "install" ? "Lockfile does not match" : "Invalid protobuf contract"));
    assert.ok(output.includes("startup stopped"));
    assert.ok(!output.includes("STEP:database"));
    assert.ok(!output.includes("STEP:mobile:"));
    assert.ok(!output.includes("scripts/next.mjs dev"));
    if (failure === "install") assert.ok(!output.includes("STEP:pnpm:gen"));
  });
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
  const output = startDevelopment([], { setup: true });
  assert.ok(output.includes("Set POSTGRES_PASSWORD in the Secrets section"));
  assert.ok(!output.includes("STEP:database"));
  assert.ok(!output.includes("scripts/next.mjs dev"));
});

for (const argumentsList of [[], ["--mobile-ios"], ["--mobile-android"]]) {
  test(`migration failures stop startup before web/mobile: ${argumentsList.join(" ") || "web"}`, () => {
    const output = startDevelopment(argumentsList, { migrations: true });
    assert.ok(output.includes("preceding already run migration"));
    assert.ok(output.includes("database migrations failed; web and mobile startup stopped"));
    assert.ok(!output.includes("database migrations passed"));
    assert.ok(!output.includes("scripts/next.mjs dev"));
    assert.ok(!output.includes("STEP:mobile:"));
  });
}

test("shutdown works without running setup or requiring authentication credentials", () => {
  const output = startDevelopment(["--down"], { setup: true, migrations: true, install: true, generation: true });
  assert.ok(output.includes("STEP:docker:compose down --remove-orphans"));
  assert.ok(!output.includes("check-apple-auth.mts"));
  assert.ok(!output.includes("setup-env.mjs"));
  assert.ok(!output.includes("STEP:database"));
  assert.ok(!output.includes("scripts/prepare-database.mts"));
  assert.ok(!output.includes("STEP:pnpm:install"));
  assert.ok(!output.includes("STEP:pnpm:gen"));
});

/**
 * Runs a stand-in for a Next dev server already serving the checkout: a live
 * process whose command line names Next, as `next-server` does.
 * @param {(pid: number) => void} body Receives the stand-in's PID.
 */
function withRunningWebServer(body) {
  const server = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)", "next-server"], { stdio: "ignore" });
  try {
    body(server.pid);
  } finally {
    server.kill();
  }
}

/**
 * Next's lock for a dev server, as Next 16 writes it.
 * @param {number} pid Server process.
 * @param {string} hostname "127.0.0.1" for a loopback bind, "localhost" for every interface.
 * @param {number} port Listening port.
 * @returns {object} Lock contents.
 */
function webLock(pid, hostname = "127.0.0.1", port = 3000) {
  return { pid, port, hostname, appUrl: `http://${hostname}:${port}`, startedAt: Date.now() };
}

test("ios startup reuses this checkout's running web server instead of failing after the native build", () => {
  withRunningWebServer((pid) => {
    const output = startDevelopment(["--mobile-ios"], {}, { webLock: webLock(pid) });
    assert.ok(output.includes(`already running — http://127.0.0.1:3000 (PID ${pid}); reusing it`));
    assert.ok(output.indexOf("reusing it") < output.indexOf("STEP:database"), "Decided before anything slow");
    assert.ok(output.includes("STEP:mobile:ios"));
    assert.ok(!output.includes("scripts/next.mjs dev"), "A second server for the checkout is never started");
  });
});

test("web startup with this checkout's server already running starts nothing twice", () => {
  withRunningWebServer((pid) => {
    const output = startDevelopment([], {}, { webLock: webLock(pid) });
    assert.ok(output.includes("nothing else to start"));
    assert.ok(!output.includes("scripts/next.mjs dev"));
  });
});

for (const argumentsList of [["--mobile-android"], ["--lan"]]) {
  test(`${argumentsList[0]} stops before any slow step when the running server is loopback-only`, () => {
    withRunningWebServer((pid) => {
      const output = startDevelopment(argumentsList, {}, { webLock: webLock(pid), expectedStatus: 1 });
      assert.ok(output.includes("loopback only"));
      assert.ok(output.includes(`kill ${pid}`), "Says how to stop the server in the way");
      assert.ok(!output.includes("STEP:database"));
      assert.ok(!output.includes("STEP:pnpm:install"));
      assert.ok(!output.includes("STEP:mobile:"));
      assert.ok(!output.includes("scripts/next.mjs dev"));
    });
  });
}

test("android startup reuses a running server that listens on every interface", () => {
  withRunningWebServer((pid) => {
    const output = startDevelopment(["--mobile-android"], {}, { webLock: webLock(pid, "localhost") });
    assert.ok(output.includes("reusing it"));
    assert.ok(output.includes("STEP:mobile:android"));
    assert.ok(!output.includes("scripts/next.mjs dev"));
  });
});

test("mobile startup stops early when the running server is not on the app's port", () => {
  withRunningWebServer((pid) => {
    const output = startDevelopment(["--mobile-ios"], {}, { webLock: webLock(pid, "127.0.0.1", 3001), expectedStatus: 1 });
    assert.ok(output.includes("the app expects port 3000"));
    assert.ok(!output.includes("STEP:mobile:"));
  });
});

test("a lock left by a server that is gone, or whose PID now belongs to something else, is ignored", () => {
  const finished = spawnSync(process.execPath, ["-e", ""]);
  for (const pid of [finished.pid, process.pid]) {
    const output = startDevelopment(["--mobile-ios"], {}, { webLock: webLock(pid) });
    assert.ok(!output.includes("reusing it"));
    assert.ok(output.includes("scripts/next.mjs dev --turbopack -H 0.0.0.0"));
  }
});
