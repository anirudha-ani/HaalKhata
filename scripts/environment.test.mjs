/** Regression tests for shared local environment loading and Expo secret isolation. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadEnvironmentFile } from "./environment.mjs";

test("web reads multiline keys; Expo receives only public values; shell values win", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-env-"));
  try {
    const filename = join(directory, ".env");
    writeFileSync(filename, 'APPLE_PRIVATE_KEY="first line\nsecond line"\nAPPLE_PRIVATE_KEY_FILE=/private/key.p8\nNEXT_PUBLIC_GOOGLE_CLIENT_ID=web-id\nEXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=ios-id\nEXPO_PUBLIC_API_URL=https://dev.example.com\n');
    const backend = { EXPO_PUBLIC_API_URL: "shell-value" };
    loadEnvironmentFile(filename, { environment: backend });
    assert.equal(backend.APPLE_PRIVATE_KEY, "first line\nsecond line");
    assert.equal(backend.APPLE_PRIVATE_KEY_FILE, "/private/key.p8");
    assert.equal(backend.NEXT_PUBLIC_GOOGLE_CLIENT_ID, "web-id");
    assert.equal(backend.EXPO_PUBLIC_API_URL, "shell-value");
    const mobile = { EXPO_PUBLIC_API_URL: "" };
    loadEnvironmentFile(filename, { environment: mobile, publicOnly: true });
    assert.deepEqual(mobile, { EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios-id", EXPO_PUBLIC_API_URL: "" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("relative Apple keys follow their .env after moving a checkout, from root and apps/web", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata portable key "));
  try {
    const original = join(directory, "original checkout");
    const moved = join(directory, "moved checkout");
    mkdirSync(join(original, "apps/web"), { recursive: true });
    const source = "APPLE_PRIVATE_KEY_FILE=AppleAuthKey.p8\n";
    writeFileSync(join(original, ".env"), source);
    writeFileSync(join(original, "AppleAuthKey.p8"), "root-key-fixture\n");
    writeFileSync(join(original, "apps/web/AppleAuthKey.p8"), "wrong-working-directory-key\n");
    for (const checkout of [original, moved]) {
      if (checkout === moved) renameSync(original, moved);
      for (const workingDirectory of [checkout, join(checkout, "apps/web")]) {
        const result = spawnSync(process.execPath, ["--input-type=module", "-e",
          'import { readFileSync } from "node:fs"; const { loadEnvironmentFile } = await import(process.argv[1]); const environment = {}; loadEnvironmentFile(process.argv[2], { environment }); if (readFileSync(environment.APPLE_PRIVATE_KEY_FILE, "utf8") !== "root-key-fixture\\n") process.exit(1);',
          new URL("./environment.mjs", import.meta.url).href, join(checkout, ".env")], { cwd: workingDirectory, encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
      }
      assert.equal(readFileSync(join(checkout, ".env"), "utf8"), source);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Apple path resolution preserves shell overrides, blank paths and Expo secret isolation", () => {
  const directory = mkdtempSync(join(tmpdir(), "haalkhata-key-overrides-"));
  try {
    const filename = join(directory, ".env");
    writeFileSync(filename, "APPLE_PRIVATE_KEY_FILE=AppleAuthKey.p8\nEXPO_PUBLIC_API_URL=https://dev.example.com\n");
    for (const configured of ["", "/run/secrets/apple_private_key", "shell-relative-key.p8"]) {
      const environment = { APPLE_PRIVATE_KEY_FILE: configured };
      loadEnvironmentFile(filename, { environment });
      assert.equal(environment.APPLE_PRIVATE_KEY_FILE, configured);
    }
    const mobile = {};
    loadEnvironmentFile(filename, { environment: mobile, publicOnly: true });
    assert.deepEqual(mobile, { EXPO_PUBLIC_API_URL: "https://dev.example.com" });
    writeFileSync(filename, "APPLE_PRIVATE_KEY_FILE=\n");
    const backend = {};
    loadEnvironmentFile(filename, { environment: backend });
    assert.equal(backend.APPLE_PRIVATE_KEY_FILE, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CI and EAS do not require a checked-out environment file", () => {
  const environment = { EXPO_PUBLIC_API_URL: "https://release.example.com" };
  loadEnvironmentFile("/does-not-exist/haalkhata.env", { environment });
  assert.equal(environment.EXPO_PUBLIC_API_URL, "https://release.example.com");
});
