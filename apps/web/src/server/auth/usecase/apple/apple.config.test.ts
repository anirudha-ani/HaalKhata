/** Apple callback constraints apply equally to local development and production. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { appleBrowserCallbackUrl } from "./apple.config";

afterEach(() => vi.unstubAllEnvs());

describe("Apple browser callback configuration", () => {
  it("uses the explicitly configured development domain", () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://haalkhata-dev.example.com");
    expect(appleBrowserCallbackUrl()).toBe("https://haalkhata-dev.example.com/api/auth/apple/callback");
  });
  it.each([undefined, "", "not a URL", "http://dev.example.com", "https://localhost", "https://test.localhost",
    "https://127.0.0.1", "https://[::1]", "https://user:password@dev.example.com",
    "https://dev.example.com/path", "https://dev.example.com/?query=yes", "https://dev.example.com/#fragment"])(
    "rejects an invalid callback origin instead of falling back to production: %s", (origin) => {
      vi.stubEnv("APP_PUBLIC_URL", origin);
      expect(appleBrowserCallbackUrl).toThrow(/APP_PUBLIC_URL/);
    });
});
