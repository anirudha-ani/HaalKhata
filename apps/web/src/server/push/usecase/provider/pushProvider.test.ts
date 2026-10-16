/** Tests for choosing the push provider and refusing unsafe production configuration. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPushConfigured, configuredPushProvider, pushProvider } from "./pushProvider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuredPushProvider", () => {
  it("defaults to the log provider outside production and Expo in production", () => {
    vi.stubEnv("PUSH_PROVIDER", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(configuredPushProvider()).toBe("log");
    vi.stubEnv("NODE_ENV", "production");
    expect(configuredPushProvider()).toBe("expo");
  });

  it("follows PUSH_PROVIDER when set", () => {
    vi.stubEnv("PUSH_PROVIDER", "expo");
    vi.stubEnv("NODE_ENV", "development");
    expect(pushProvider().name).toBe("expo");
  });
});

describe("assertPushConfigured", () => {
  it("accepts the log provider in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PUSH_PROVIDER", "log");
    expect(() => assertPushConfigured()).not.toThrow();
  });

  it("refuses an unknown provider anywhere", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PUSH_PROVIDER", "carrier-pigeon");
    expect(() => assertPushConfigured()).toThrow(/not one of/);
  });

  it("refuses the log provider in production, where pushes would silently go nowhere", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUSH_PROVIDER", "log");
    expect(() => assertPushConfigured()).toThrow(/must use PUSH_PROVIDER=expo/);
  });

  it("refuses Expo in production without an access token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUSH_PROVIDER", "expo");
    vi.stubEnv("EXPO_ACCESS_TOKEN", "");
    vi.stubEnv("EXPO_ACCESS_TOKEN_FILE", "");
    expect(() => assertPushConfigured()).toThrow(/EXPO_ACCESS_TOKEN is unset/);
  });

  it("accepts Expo in production with an access token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUSH_PROVIDER", "expo");
    vi.stubEnv("EXPO_ACCESS_TOKEN_FILE", "");
    vi.stubEnv("EXPO_ACCESS_TOKEN", "expo-token-for-tests");
    expect(() => assertPushConfigured()).not.toThrow();
  });
});
