/** Unit tests for the shared keyset-paging helpers. */

import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  isCursorValue,
  isExactTimestamp,
  pageSize,
} from "./pagination";
import { MAX_CURSOR_LENGTH, MAX_CURSOR_VALUE_LENGTH } from "./pagination.constants";

describe("pageSize", () => {
  it("uses the list's default when none is asked for", () => {
    expect(pageSize(0, 50, 100)).toBe(50);
    expect(pageSize(-3, 50, 100)).toBe(50);
  });

  it("keeps a requested size within the maximum", () => {
    expect(pageSize(20, 50, 100)).toBe(20);
    expect(pageSize(10_000, 50, 100)).toBe(100);
  });
});

describe("cursors", () => {
  it("round-trips a position", () => {
    const parts = ["2026-10-20", "2026-10-20T12:00:00.123456Z", "expense-1"];
    expect(decodeCursor(encodeCursor(parts), 3)).toEqual(parts);
  });

  it("refuses a cursor of another shape, or not ours at all", () => {
    expect(decodeCursor(encodeCursor(["one", "two"]), 3)).toBeNull();
    expect(decodeCursor("not a cursor", 3)).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify([1, 2, 3])).toString("base64url"), 3)).toBeNull();
    expect(decodeCursor("", 3)).toBeNull();
    expect(decodeCursor("a".repeat(MAX_CURSOR_LENGTH + 1), 3)).toBeNull();
  });
});

describe("cursor values", () => {
  it("accepts a real microsecond instant and nothing looser", () => {
    expect(isExactTimestamp("2026-10-20T12:00:00.123456Z")).toBe(true);
    expect(isExactTimestamp("2026-10-20T12:00:00.123Z")).toBe(false);
    expect(isExactTimestamp("2026-02-30T12:00:00.123456Z")).toBe(false);
  });

  it("accepts an id or a stored day of a plausible length", () => {
    expect(isCursorValue("7d953b7f-5ace-4a43-9ef7-12c3ce440ca3")).toBe(true);
    expect(isCursorValue("2026-10-20")).toBe(true);
    expect(isCursorValue("")).toBe(false);
    expect(isCursorValue("x".repeat(MAX_CURSOR_VALUE_LENGTH + 1))).toBe(false);
  });
});
