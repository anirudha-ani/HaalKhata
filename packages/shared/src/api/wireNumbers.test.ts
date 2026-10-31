/**
 * The API's 64-bit integers become plain numbers on the way in and 64-bit
 * integers on the way out, everywhere in a message — nested, in lists, in
 * maps and in oneofs — and a value a number cannot hold exactly is refused,
 * never rounded.
 */

import {
  create,
  createFileRegistry,
  fromJson,
  toJson,
  type DescMessage,
} from "@bufbuild/protobuf";
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorProtoSchema,
} from "@bufbuild/protobuf/wkt";
import { UserSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { ExpenseSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { GetInsightsResponseSchema } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { describe, expect, it } from "vitest";
import { createPlain, plainNumbers, wireIntegers, WireNumberError } from "./wireNumbers";

const { OPTIONAL: LABEL_OPTIONAL, REPEATED: LABEL_REPEATED } = FieldDescriptorProto_Label;
const { INT64: TYPE_INT64, MESSAGE: TYPE_MESSAGE, STRING: TYPE_STRING } = FieldDescriptorProto_Type;

/**
 * A message the API does not have, holding a 64-bit integer in a map and in
 * a oneof, so those paths are exercised too.
 */
const LedgerSchema: DescMessage = createFileRegistry(
  create(FileDescriptorProtoSchema, {
    name: "wire_numbers_test.proto",
    package: "wiretest",
    syntax: "proto3",
    messageType: [
      {
        name: "Ledger",
        field: [
          { name: "by_currency", number: 1, label: LABEL_REPEATED, type: TYPE_MESSAGE, typeName: ".wiretest.Ledger.ByCurrencyEntry" },
          { name: "cash_cents", number: 2, label: LABEL_OPTIONAL, type: TYPE_INT64, oneofIndex: 0 },
          { name: "note", number: 3, label: LABEL_OPTIONAL, type: TYPE_STRING, oneofIndex: 0 },
        ],
        nestedType: [
          {
            name: "ByCurrencyEntry",
            field: [
              { name: "key", number: 1, label: LABEL_OPTIONAL, type: TYPE_STRING },
              { name: "value", number: 2, label: LABEL_OPTIONAL, type: TYPE_INT64 },
            ],
            options: { mapEntry: true },
          },
        ],
        oneofDecl: [{ name: "settled" }],
      },
    ],
  }),
  () => undefined,
).getMessage("wiretest.Ledger")!;

describe("plainNumbers", () => {
  it("turns every 64-bit field of a decoded message into a number, at any depth", () => {
    const expense = create(ExpenseSchema, {
      amountCents: 10_000_000_000_000n,
      taxCents: 7n,
      payers: [{ userId: "pat", amountCents: 10_000_000_000_000n }],
      splits: [{ userId: "sam", owedCents: 5_000_000_000_000n }],
      items: [{ name: "Deposit", quantity: 1, totalCents: 9_999_999_999_993n }],
    });

    const plain = plainNumbers(ExpenseSchema, expense);

    expect(plain.amountCents).toBe(10_000_000_000_000);
    expect(plain.taxCents).toBe(7);
    expect(plain.payers[0].amountCents).toBe(10_000_000_000_000);
    expect(plain.splits[0].owedCents).toBe(5_000_000_000_000);
    expect(plain.items[0]).toMatchObject({ name: "Deposit", quantity: 1, totalCents: 9_999_999_999_993 });
    expect(plain.$typeName).toBe("expense.v1.Expense");
  });

  it("converts lists of 64-bit values, map values and the chosen oneof case", () => {
    const insights = create(GetInsightsResponseSchema, {
      currencies: [{ currency: "IDR", monthlyShareCents: [2_500_000_000n, 0n, 1n] }],
    });
    const ledger = { $typeName: "wiretest.Ledger", byCurrency: { IDR: 2_500_000_000n }, settled: { case: "cashCents", value: 42n } };

    expect(plainNumbers(GetInsightsResponseSchema, insights).currencies[0].monthlyShareCents).toEqual([2_500_000_000, 0, 1]);
    expect(plainNumbers(LedgerSchema, ledger as never)).toMatchObject({
      byCurrency: { IDR: 2_500_000_000 },
      settled: { case: "cashCents", value: 42 },
    });
  });

  it("hands back a message with no 64-bit field untouched", () => {
    const user = create(UserSchema, { id: "pat", name: "Pat" });

    expect(plainNumbers(UserSchema, user)).toBe(user);
  });

  it("refuses a value past 2^53 − 1 either way, naming the field", () => {
    const tooBig = create(ExpenseSchema, { payers: [{ userId: "pat", amountCents: 9_007_199_254_740_992n }] });
    const tooSmall = create(ExpenseSchema, { amountCents: -9_007_199_254_740_992n });

    expect(() => plainNumbers(ExpenseSchema, tooBig)).toThrow(WireNumberError);
    expect(() => plainNumbers(ExpenseSchema, tooBig)).toThrow(/expense\.v1\.Payer\.amount_cents/);
    expect(() => plainNumbers(ExpenseSchema, tooSmall)).toThrow(WireNumberError);
    expect(plainNumbers(ExpenseSchema, create(ExpenseSchema, { amountCents: 9_007_199_254_740_991n })).amountCents).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});

describe("wireIntegers", () => {
  it("turns numbers into the 64-bit integers protobuf-es encodes, and back without loss", () => {
    const outgoing = wireIntegers(ExpenseSchema, {
      amountCents: 12_345_678_901_234,
      payers: [{ userId: "pat", amountCents: 12_345_678_901_234 }],
    });
    const json = toJson(ExpenseSchema, create(ExpenseSchema, outgoing)) as Record<string, unknown>;

    expect(json.amountCents).toBe("12345678901234");
    expect(plainNumbers(ExpenseSchema, fromJson(ExpenseSchema, json as never)).payers[0].amountCents).toBe(12_345_678_901_234);
  });

  it("converts map values and the chosen oneof case", () => {
    expect(wireIntegers(LedgerSchema, { byCurrency: { USD: 5 }, settled: { case: "cashCents", value: 9 } } as never)).toMatchObject({
      byCurrency: { USD: 5n },
      settled: { case: "cashCents", value: 9n },
    });
  });

  it("refuses a fraction, a non-finite number or one already past 2^53", () => {
    expect(() => wireIntegers(ExpenseSchema, { amountCents: 12.5 })).toThrow(WireNumberError);
    expect(() => wireIntegers(ExpenseSchema, { amountCents: Number.POSITIVE_INFINITY })).toThrow(WireNumberError);
    expect(() => wireIntegers(ExpenseSchema, { amountCents: 2 ** 53 })).toThrow(WireNumberError);
  });
});

describe("createPlain", () => {
  it("builds a complete message with plain numbers, as a plain client returns it", () => {
    const expense = createPlain(ExpenseSchema, { id: "dinner", amountCents: 2_500 });

    expect(expense).toMatchObject({ id: "dinner", amountCents: 2_500, taxCents: 0, payers: [] });
  });
});
