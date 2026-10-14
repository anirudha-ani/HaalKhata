/** Optional provider visibility follows real signing/encryption configuration without contacting Apple. */

import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAppleSignInConfigured } from "./apple.provider";
import { getSignInOptions } from "./signInOptions.usecase";

let privateKey: string;
beforeAll(async () => {
  privateKey = await exportPKCS8((await generateKeyPair("ES256", { extractable: true })).privateKey);
});
beforeEach(() => {
  vi.stubEnv("APPLE_PRIVATE_KEY", privateKey);
  vi.stubEnv("APPLE_PRIVATE_KEY_FILE", "");
  vi.stubEnv("APPLE_TEAM_ID", "TESTTEAM12");
  vi.stubEnv("APPLE_KEY_ID", "TESTKEY123");
  vi.stubEnv("APPLE_SERVICE_ID", "com.example.web");
  vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY_FILE", "");
  vi.stubEnv("APP_PUBLIC_URL", "https://dev.example.com");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("public Apple availability", () => {
  it.each([
    ["APPLE_PRIVATE_KEY", ""], ["APPLE_PRIVATE_KEY", "PLACEHOLDER: paste your original key here"],
    ["APPLE_PRIVATE_KEY_FILE", "/missing/apple-key.p8"], ["APPLE_TEAM_ID", ""], ["APPLE_KEY_ID", ""],
    ["APPLE_TOKEN_ENCRYPTION_KEY", ""], ["APPLE_TOKEN_ENCRYPTION_KEY", "invalid"],
    ["APPLE_TOKEN_ENCRYPTION_KEY_FILE", "/missing/encryption-key"],
  ])("hides both flows when %s is missing or unusable", async (name, value) => {
    vi.stubEnv(name, value);
    await expect(getSignInOptions()).resolves.toEqual({ appleNativeEnabled: false, appleBrowserEnabled: false });
    expect(fetch).not.toHaveBeenCalled();
    // Optional visibility does not relax the strict release/start-sign-in checks.
    await expect(assertAppleSignInConfigured()).rejects.toThrow();
  });
  it.each([["APPLE_SERVICE_ID", ""], ["APP_PUBLIC_URL", ""], ["APP_PUBLIC_URL", "http://localhost:3000"]])(
    "keeps native iOS independent of missing browser configuration: %s", async (name, value) => {
      vi.stubEnv(name, value);
      await expect(getSignInOptions()).resolves.toEqual({ appleNativeEnabled: true, appleBrowserEnabled: false });
    });
  it("enables configured flows and returns only public booleans", async () => {
    await expect(getSignInOptions()).resolves.toEqual({ appleNativeEnabled: true, appleBrowserEnabled: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
