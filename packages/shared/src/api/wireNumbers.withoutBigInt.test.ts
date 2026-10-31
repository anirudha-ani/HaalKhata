/**
 * On a JavaScript engine without 64-bit DataView methods, protobuf-es keeps
 * 64-bit integers as decimal strings instead of bigint. The conversion
 * works the same there: numbers in, numbers out, nothing past 2^53.
 */

import { describe, expect, it, vi } from "vitest";

// protobuf-es decides once, when it loads; this switch makes it take the
// string path a phone's engine may take. Every import below is dynamic so
// it loads after the switch is set.
vi.stubEnv("BUF_BIGINT_DISABLE", "1");
const { create, protoInt64, toJson } = await import("@bufbuild/protobuf");
const { ExpenseSchema } = await import("@haalkhata/protogen/expense/v1/expense_pb");
const { plainNumbers, wireIntegers, WireNumberError } = await import("./wireNumbers");

describe("64-bit integers kept as strings", () => {
  it("is the mode under test", () => {
    expect(protoInt64.supported).toBe(false);
    expect(typeof create(ExpenseSchema, {}).amountCents).toBe("string");
  });

  it("reads them as numbers and sends numbers as the strings protobuf-es expects", () => {
    const outgoing = create(ExpenseSchema, wireIntegers(ExpenseSchema, { amountCents: 12_345_678_901_234 }));

    expect(outgoing.amountCents).toBe("12345678901234");
    expect((toJson(ExpenseSchema, outgoing) as { amountCents: string }).amountCents).toBe("12345678901234");
    expect(plainNumbers(ExpenseSchema, outgoing).amountCents).toBe(12_345_678_901_234);
  });

  it("still refuses a value past 2^53", () => {
    const tooBig = create(ExpenseSchema, { amountCents: "9007199254740993" as never });

    expect(() => plainNumbers(ExpenseSchema, tooBig)).toThrow(WireNumberError);
  });
});
