/** Security regressions for mobile API transport URL validation. */

import { describe, expect, it } from "vitest";
import { buildApiBaseUrl } from "./apiUrl";

describe("mobile API URL", () => {
  it("accepts an HTTPS release origin and normalizes its trailing slash", () => {
    expect(buildApiBaseUrl("https://khata.example.com/", false, "http://localhost:3000")).toBe(
      "https://khata.example.com/api/connect",
    );
  });

  it("rejects missing and plaintext release origins", () => {
    expect(() => buildApiBaseUrl(undefined, false, "http://10.0.2.2:3000")).toThrow(
      "must be configured",
    );
    expect(() =>
      buildApiBaseUrl("http://khata.example.com", false, "http://localhost:3000"),
    ).toThrow("must use HTTPS");
  });

  it("allows Metro HTTP origins only in development", () => {
    expect(buildApiBaseUrl(undefined, true, "http://10.0.2.2:3000")).toBe(
      "http://10.0.2.2:3000/api/connect",
    );
    expect(buildApiBaseUrl("http://192.0.2.10:3000", true, "http://localhost:3000")).toBe(
      "http://192.0.2.10:3000/api/connect",
    );
  });

  it.each([
    "ftp://khata.example.com",
    "https://user:secret@khata.example.com",
    "https://khata.example.com/prefix",
    "https://khata.example.com?tenant=one",
    "not a URL",
  ])("rejects malformed or non-origin configuration %s", (configuredOrigin) => {
    expect(() => buildApiBaseUrl(configuredOrigin, false, "http://localhost:3000")).toThrow();
  });
});
