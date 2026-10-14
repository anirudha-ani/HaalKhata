/** Regression tests for shared local environment loading and Expo secret isolation. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    assert.equal(backend.NEXT_PUBLIC_GOOGLE_CLIENT_ID, "web-id");
    assert.equal(backend.EXPO_PUBLIC_API_URL, "shell-value");
    const mobile = { EXPO_PUBLIC_API_URL: "" };
    loadEnvironmentFile(filename, { environment: mobile, publicOnly: true });
    assert.deepEqual(mobile, { EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios-id", EXPO_PUBLIC_API_URL: "" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CI and EAS do not require a checked-out environment file", () => {
  const environment = { EXPO_PUBLIC_API_URL: "https://release.example.com" };
  loadEnvironmentFile("/does-not-exist/haalkhata.env", { environment });
  assert.equal(environment.EXPO_PUBLIC_API_URL, "https://release.example.com");
});
