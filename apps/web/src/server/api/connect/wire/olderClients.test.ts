/**
 * App versions built before money became 64-bit still read and send it.
 * Both apps speak Connect's JSON, where a 64-bit integer travels as a
 * string: an older app's 32-bit field reads that string as the same number,
 * and refuses one past 32 bits instead of showing it wrong; the server's
 * 64-bit field reads the plain JSON number an older app sends.
 */

import { create, createFileRegistry, fromJson, toJson, type DescMessage } from "@bufbuild/protobuf";
import { FieldDescriptorProto_Label, FieldDescriptorProto_Type, FileDescriptorProtoSchema } from "@bufbuild/protobuf/wkt";
import { CurrencyAmountSchema } from "@haalkhata/protogen/common/v1/common_pb";
import { describe, expect, it } from "vitest";

/** `common.v1.CurrencyAmount` as an older app has it, with 32-bit cents. */
const OlderCurrencyAmountSchema: DescMessage = createFileRegistry(
  create(FileDescriptorProtoSchema, {
    name: "common/v1/common.proto",
    package: "common.v1",
    syntax: "proto3",
    messageType: [
      {
        name: "CurrencyAmount",
        field: [
          { name: "currency", jsonName: "currency", number: 1, label: FieldDescriptorProto_Label.OPTIONAL, type: FieldDescriptorProto_Type.STRING },
          { name: "cents", jsonName: "cents", number: 2, label: FieldDescriptorProto_Label.OPTIONAL, type: FieldDescriptorProto_Type.INT32 },
        ],
      },
    ],
  }),
  () => undefined,
).getMessage("common.v1.CurrencyAmount")!;

describe("older app versions against 64-bit money", () => {
  it("read a figure that fits 32 bits as the same number", () => {
    const sent = toJson(CurrencyAmountSchema, create(CurrencyAmountSchema, { currency: "USD", cents: 123_456n }));

    expect(sent).toEqual({ currency: "USD", cents: "123456" });
    expect(fromJson(OlderCurrencyAmountSchema, sent)).toMatchObject({ currency: "USD", cents: 123_456 });
  });

  it("refuse a figure past 32 bits rather than show it wrong", () => {
    const sent = toJson(CurrencyAmountSchema, create(CurrencyAmountSchema, { currency: "IDR", cents: 2_500_000_000_000n }));

    expect(() => fromJson(OlderCurrencyAmountSchema, sent)).toThrow();
  });

  it("are understood when they send a plain number", () => {
    const sent = toJson(OlderCurrencyAmountSchema, create(OlderCurrencyAmountSchema, { currency: "USD", cents: 98_765 }));

    expect(sent).toEqual({ currency: "USD", cents: 98_765 });
    expect(fromJson(CurrencyAmountSchema, sent)).toMatchObject({ currency: "USD", cents: 98_765n });
  });
});
