/** Verifies native dev-client reuse and rebuild ordering without touching a real device. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildRecordPath, recordCompletedBuild, verifyBuildRecord } from "../apps/mobile/scripts/native-build.mjs";

/** Real shell orchestration with only external tools replaced. */
const NATIVE_HARNESS = `
exec 2>&1
uname() { echo Linux; }
source "$1/dev.sh"
cd "$1"
ios_simulator_udid() { echo simulator-fixture; }
find_adb() { echo adb; }
write_local_properties() { echo STEP:android-sdk; }
have() { return 0; }
node() {
  if [[ "$2" == "check" ]]; then
    [[ "$FAIL_NATIVE_STAGE" != "fingerprint" ]] || { echo 'Fingerprint error' >&2; return 1; }
    echo "$NATIVE_STATE"
  elif [[ "$2" == "fingerprint" ]]; then
    echo STEP:fingerprint >&2
    echo native-before
  else
    [[ "$5" == "native-before" ]] || return 1
    [[ "$FAIL_NATIVE_STAGE" != "record" ]] || { echo 'Record write error' >&2; return 1; }
    echo STEP:record
  fi
}
pnpm() {
  echo STEP:pnpm:$*
  if [[ "$*" == *prebuild* && "$FAIL_NATIVE_STAGE" == "prebuild" ]]; then return 1; fi
  if [[ "$*" == *run:ios* && "$FAIL_NATIVE_STAGE" == "build" ]]; then return 1; fi
  return 0
}
pod() {
  echo STEP:pods
  [[ "$FAIL_NATIVE_STAGE" != "pods" ]]
}
xcrun() {
  case "$2" in
    get_app_container)
      [[ "$MISSING_APP" != "1" || -f installed ]] || return 1
      echo /fixture/installed-app ;;
    install)
      echo STEP:install
      [[ "$FAIL_NATIVE_STAGE" != "install" ]] || return 1
      touch installed ;;
  esac
}
adb() {
  if [[ "$1" == "devices" ]]; then printf 'List of devices attached\\n%s\\tdevice\\n' emulator-fixture;
  elif [[ "$1" == "-s" && "$2" == "emulator-fixture" && "$3" == "install" ]]; then
    echo STEP:install
    [[ "$FAIL_NATIVE_STAGE" != "install" ]] || return 1
  elif [[ "$1" == "-s" && "$2" == "emulator-fixture" ]]; then echo 'lastUpdateTime=fixture';
  else return 1; fi
}
ensure_"$2"_app
echo STEP:ready
`;

/**
 * Runs the real native preparation function against an existing generated project.
 * @param {"ios" | "android"} platform Platform to exercise.
 * @param {{state?: string, failure?: string, missing?: boolean}} options Simulated installed binary and external failures.
 * @returns {string} Preparation output.
 */
function prepareNative(platform, { state = "rebuild", failure = "", missing = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata native "));
  try {
    for (const folder of ["scripts", "apps/mobile/ios", "apps/mobile/android"]) mkdirSync(join(directory, folder), { recursive: true });
    copyFileSync(new URL("../dev.sh", import.meta.url), join(directory, "dev.sh"));
    copyFileSync(new URL("./macos-env.sh", import.meta.url), join(directory, "scripts/macos-env.sh"));
    writeFileSync(join(directory, "apps/mobile/android/gradlew"), '#!/usr/bin/env bash\necho STEP:gradle\n[[ "$FAIL_NATIVE_STAGE" != "build" ]]\n', { mode: 0o755 });
    const result = spawnSync("bash", ["-c", NATIVE_HARNESS, "native-test", directory, platform], {
      env: { ...process.env, ANDROID_HOME: "/fixture/sdk", ANDROID_SERIAL: "", NATIVE_STATE: state, FAIL_NATIVE_STAGE: failure, MISSING_APP: missing ? "1" : "0" },
      encoding: "utf8",
    });
    assert.equal(result.status, failure ? 1 : 0, result.stdout + result.stderr);
    return result.stdout + result.stderr;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

for (const platform of ["ios", "android"]) {
  test(`${platform} reuses only a verified compatible installed client`, () => {
    const output = prepareNative(platform, { state: "current" });
    assert.ok(output.includes("matches current native dependencies"));
    assert.ok(!output.includes("prebuild"));
    assert.ok(!output.includes("STEP:record"));
    assert.ok(output.includes("STEP:ready"));
  });

  test(`${platform} refreshes an existing native project and records only a completed installation`, () => {
    const output = prepareNative(platform);
    const prebuild = output.indexOf(`prebuild --platform ${platform} --no-install`);
    const compiled = output.indexOf(platform === "ios" ? "run:ios --device generic" : "STEP:gradle");
    assert.ok(prebuild >= 0 && compiled > prebuild);
    assert.ok(output.indexOf("STEP:fingerprint") > prebuild);
    assert.ok(output.indexOf("STEP:fingerprint") < compiled);
    if (platform === "ios") {
      assert.ok(output.indexOf("STEP:pods") > prebuild);
      assert.ok(output.indexOf("STEP:pods") < compiled);
      assert.ok(output.indexOf("STEP:install") > compiled);
      assert.ok(output.indexOf("STEP:record") > output.indexOf("STEP:install"));
    }
    assert.ok(output.indexOf("STEP:record") > compiled);
    assert.ok(output.indexOf("STEP:ready") > output.indexOf("STEP:record"));
  });

  for (const failure of ["fingerprint", "prebuild", "build", "record", "install", ...(platform === "ios" ? ["pods"] : [])]) {
    test(`${platform} ${failure} failure never records compatibility or continues startup`, () => {
      const output = prepareNative(platform, { failure });
      assert.ok(!output.includes("STEP:record"));
      assert.ok(!output.includes("STEP:ready"));
    });
  }
}

test("an uninstalled iOS client rebuilds even when the previous native state was current", () => {
  const output = prepareNative("ios", { missing: true, state: "current" });
  assert.ok(output.includes("prebuild --platform ios"));
  assert.ok(output.includes("STEP:record"));
});

test("build records are isolated by platform and installation and invalidate on native changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-native-record-"));
  try {
    const first = buildRecordPath(directory, "android", "device:first-install");
    const second = buildRecordPath(directory, "android", "device:reinstalled");
    assert.equal(verifyBuildRecord(first, "native-before"), false);
    verifyBuildRecord(first, "native-before", true);
    assert.equal(verifyBuildRecord(first, "native-before"), true);
    assert.equal(verifyBuildRecord(first, "native-after"), false);
    assert.equal(verifyBuildRecord(second, "native-before"), false);
    assert.throws(() => buildRecordPath(directory, "android", ""));
    const bundle = join(directory, "bundle");
    mkdirSync(bundle);
    writeFileSync(join(bundle, "Info.plist"), "fixture");
    const iosRecord = buildRecordPath(directory, "ios", bundle);
    assert.notEqual(iosRecord, buildRecordPath(directory, "android", bundle));
    verifyBuildRecord(iosRecord, "native-before", true);
    assert.equal(verifyBuildRecord(iosRecord, "native-before"), true);
    utimesSync(join(bundle, "Info.plist"), 1, 1);
    assert.notEqual(buildRecordPath(directory, "ios", bundle), iosRecord);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("native inputs changed during compilation are never certified", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-native-snapshot-"));
  try {
    const filename = join(directory, "record.txt");
    assert.throws(() => recordCompletedBuild(filename, "before", "after"), /changed during the build/);
    assert.equal(verifyBuildRecord(filename, "after"), false);
    recordCompletedBuild(filename, "before", "before");
    assert.equal(verifyBuildRecord(filename, "before"), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("the native-build CLI executes through a symlinked checkout", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-native-symlink-"));
  try {
    const target = join(directory, "checkout");
    symlinkSync(new URL("../", import.meta.url).pathname, target, "dir");
    const result = spawnSync(process.execPath, [join(target, "apps/mobile/scripts/native-build.mjs"), "invalid-action"], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected check, record or fingerprint/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("multiple Android targets fail before building unless ANDROID_SERIAL selects one", () => {
  const script = `
    source "$1/dev.sh"
    adb() { printf 'List of devices attached\nemulator-one\tdevice\nphone-two\tdevice\n'; }
    select_android_device adb
    echo "SELECTED:$ANDROID_SERIAL"
  `;
  const directory = new URL("../", import.meta.url).pathname;
  for (const serial of ["", "phone-two", "missing"]) {
    const result = spawnSync("bash", ["-c", script, "select-test", directory], { env: { ...process.env, ANDROID_SERIAL: serial }, encoding: "utf8" });
    assert.equal(result.status, serial === "phone-two" ? 0 : 1, result.stdout + result.stderr);
    if (serial === "") assert.match(result.stderr, /multiple Android targets.*ANDROID_SERIAL=/);
    if (serial === "phone-two") assert.match(result.stdout, /SELECTED:phone-two/);
    if (serial === "missing") assert.match(result.stderr, /not connected\/authorized/);
  }
});
