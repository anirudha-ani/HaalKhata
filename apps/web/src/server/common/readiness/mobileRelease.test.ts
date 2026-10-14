/** Association documents must match real signing identifiers and reject placeholders. */

import { afterEach, expect, it, vi } from "vitest";
import { androidAssetLinks, appleAppAssociation } from "./mobileRelease";

afterEach(() => vi.unstubAllEnvs());
it("refuses an absent Apple signing prefix", () => {
  vi.stubEnv("APPLE_TEAM_ID", ""); vi.stubEnv("APPLE_APP_ID_PREFIX", "");
  expect(appleAppAssociation()).toBeNull();
});
it("uses a legacy App ID prefix when it differs from the Team ID", () => {
  vi.stubEnv("APPLE_TEAM_ID", "TEAM123456"); vi.stubEnv("APPLE_APP_ID_PREFIX", "PREFIX1234");
  expect(appleAppAssociation()?.applinks.details[0]).toEqual({ appIDs: ["PREFIX1234.com.haalkhata.app"], components: [{ "/": "/join/*" }] });
});
it("requires complete Android certificate fingerprints", () => {
  vi.stubEnv("ANDROID_SHA256_CERTIFICATES", "placeholder"); expect(androidAssetLinks()).toBeNull();
  const certificate = Array(32).fill("AB").join(":");
  vi.stubEnv("ANDROID_SHA256_CERTIFICATES", certificate);
  expect(androidAssetLinks()?.[0].target.sha256_cert_fingerprints).toEqual([certificate]);
});
