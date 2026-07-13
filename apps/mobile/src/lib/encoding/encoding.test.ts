/** Unit tests for the base64 → bytes decoder. */

import { describe, expect, it } from "vitest";
import { base64ToBytes } from "./encoding";

describe("base64ToBytes", () => {
  it("decodes padded and unpadded base64", () => {
    expect(Array.from(base64ToBytes("aGVsbG8="))).toEqual([104, 101, 108, 108, 111]);
    expect(Array.from(base64ToBytes("aGVsbG8"))).toEqual([104, 101, 108, 108, 111]);
    expect(Array.from(base64ToBytes("aA=="))).toEqual([104]);
  });

  it("decodes the empty string to no bytes", () => {
    expect(base64ToBytes("").length).toBe(0);
  });

  it("matches Node's decoder on binary data", () => {
    const original = Uint8Array.from({ length: 256 }, (_unused, index) => index);
    const encoded = Buffer.from(original).toString("base64");
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(original));
  });

  it("throws on characters outside the alphabet", () => {
    expect(() => base64ToBytes("a!b")).toThrow();
  });
});
