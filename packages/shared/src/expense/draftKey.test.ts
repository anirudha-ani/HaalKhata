/** Unit tests for the draft-key generator. */

import { describe, expect, it } from "vitest";
import { nextDraftKey } from "./draftKey";

describe("nextDraftKey", () => {
  it("never repeats a key", () => {
    const keys = Array.from({ length: 500 }, () => nextDraftKey());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns a non-empty string, which is all React needs of a key", () => {
    const draftKey = nextDraftKey();
    expect(typeof draftKey).toBe("string");
    expect(draftKey.length).toBeGreaterThan(0);
  });

  it("does not touch crypto, which is the entire point", () => {
    // Mobile Safari over plain http exposes `crypto` without `randomUUID`
    // (Web Crypto is secure-context only), and Hermes has no randomUUID at
    // all. Reaching for either would reintroduce the crash this replaced.
    const globalCrypto = globalThis.crypto as { randomUUID?: unknown } | undefined;
    const saved = globalCrypto?.randomUUID;
    if (globalCrypto) {
      Object.defineProperty(globalCrypto, "randomUUID", {
        configurable: true,
        value: undefined,
      });
    }
    try {
      expect(() => nextDraftKey()).not.toThrow();
    } finally {
      if (globalCrypto && saved !== undefined) {
        Object.defineProperty(globalCrypto, "randomUUID", { configurable: true, value: saved });
      }
    }
  });
});
