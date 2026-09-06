/** Unit tests for the checked int32 boundary on aggregate money. */

import { describe, expect, it } from "vitest";
import { toInt32Cents } from "./money";
import { PROTO_INT32_MAX, PROTO_INT32_MIN } from "./money.constants";

describe("toInt32Cents", () => {
  it("passes every value the wire can carry, boundaries included", () => {
    expect(toInt32Cents(0, "x")).toBe(0);
    expect(toInt32Cents(PROTO_INT32_MAX, "x")).toBe(PROTO_INT32_MAX);
    expect(toInt32Cents(PROTO_INT32_MIN, "x")).toBe(PROTO_INT32_MIN);
  });

  it("refuses one past the boundary, either way, as a named precondition failure", () => {
    // Two valid 2,000,000,000-cent rows sum past int32; the encoder would
    // throw an internal error, so this is caught first and said plainly.
    for (const value of [PROTO_INT32_MAX + 1, PROTO_INT32_MIN - 1, 4_000_000_000, Number.NaN]) {
      expect(() => toInt32Cents(value, "this balance")).toThrowError(
        expect.objectContaining({ code: "failed_precondition" }),
      );
    }
  });
});
