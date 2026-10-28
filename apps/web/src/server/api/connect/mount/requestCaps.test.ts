/** Every service's request cap fits the largest request its clients may legitimately send — and no more than needs it. */

import { create, toBinary } from "@bufbuild/protobuf";
import { CreateExpenseRequestSchema } from "@haalkhata/protogen/expense/v1/expense_pb";
import { CreateGroupRequestSchema } from "@haalkhata/protogen/group/v1/group_pb";
import { ParseReceiptRequestSchema } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { CreatePaymentMethodRequestSchema } from "@haalkhata/protogen/payment/v1/payment_pb";
import { FindContactsRequestSchema } from "@haalkhata/protogen/social/v1/social_pb";
import { MAX_PAYMENT_DETAILS_PER_METHOD } from "@haalkhata/shared/payment/payment.constants";
import {
  MAX_EXPENSE_DESCRIPTION_LENGTH,
  MAX_EXPENSE_ITEM_NAME_LENGTH,
  MAX_EXPENSE_NOTES_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_PAYMENT_DETAIL_LABEL_LENGTH,
  MAX_PAYMENT_DETAIL_VALUE_LENGTH,
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_PAYMENT_METHOD_NOTE_LENGTH,
} from "@haalkhata/shared/text/limits";
import { describe, expect, it } from "vitest";
import { MAX_EXPENSE_PARTICIPANTS, MAX_ITEM_ASSIGNMENTS } from "@/server/expense/expense.constants";
import { MAX_GROUP_MEMBER_IDS_PER_REQUEST } from "@/server/group/group.constants";
import { MAX_RECEIPT_IMAGE_BYTES } from "@haalkhata/shared/receipt/receipt.constants";
import { MAX_CONTACT_IDENTIFIER_LENGTH, MAX_CONTACT_IDENTIFIERS_PER_LOOKUP } from "@/server/social/social.constants";
import {
  DEFAULT_READ_MAX_BYTES,
  EXPENSE_READ_MAX_BYTES,
  RECEIPT_READ_MAX_BYTES,
  SOCIAL_READ_MAX_BYTES,
} from "../connect.constants";

/**
 * A user id the length real ones are (a UUID).
 *
 * @param index - Which person.
 * @returns A distinct 36-character id.
 */
const userId = (index: number) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("request caps", () => {
  it("fit a full contact lookup: the most identifiers, each as long as one may be", () => {
    const identifier = `${"x".repeat(MAX_CONTACT_IDENTIFIER_LENGTH - "@example.com".length)}@example.com`;
    const size = toBinary(
      FindContactsRequestSchema,
      create(FindContactsRequestSchema, {
        emails: Array.from({ length: MAX_CONTACT_IDENTIFIERS_PER_LOOKUP }, () => identifier),
      }),
    ).length;

    expect(size).toBeGreaterThan(DEFAULT_READ_MAX_BYTES);
    expect(size).toBeLessThan(SOCIAL_READ_MAX_BYTES);
  });

  it("fit the largest itemized expense: every item assigned to everyone, every text at its limit", () => {
    const people = Array.from({ length: MAX_EXPENSE_PARTICIPANTS }, (_unused, index) => userId(index));
    const size = toBinary(
      CreateExpenseRequestSchema,
      create(CreateExpenseRequestSchema, {
        groupId: userId(9999),
        description: "d".repeat(MAX_EXPENSE_DESCRIPTION_LENGTH),
        amountCents: 10_000_000_000_000n,
        currency: "USD",
        category: "food",
        expenseDate: "2026-10-27",
        splitType: "itemized",
        notes: "n".repeat(MAX_EXPENSE_NOTES_LENGTH),
        payers: people.map((personId) => ({ userId: personId, amountCents: 100_000_000_000n })),
        splitSpecs: people.map((personId) => ({ userId: personId, amountCents: 100_000_000_000n, percentBp: 100, shares: 1 })),
        items: Array.from({ length: MAX_EXPENSE_PARTICIPANTS }, () => ({
          name: "i".repeat(MAX_EXPENSE_ITEM_NAME_LENGTH),
          quantity: 1,
          totalCents: 100_000_000_000n,
          assignments: people.slice(0, MAX_ITEM_ASSIGNMENTS).map((personId) => ({ userId: personId, weight: 1 })),
        })),
        taxCents: 1_000_000_000_000n,
        tipCents: 1_000_000_000_000n,
        operationId: userId(1),
      }),
    ).length;

    expect(size).toBeGreaterThan(DEFAULT_READ_MAX_BYTES);
    expect(size).toBeLessThan(EXPENSE_READ_MAX_BYTES);
  });

  it("fit the largest receipt photo", () => {
    const size = toBinary(
      ParseReceiptRequestSchema,
      create(ParseReceiptRequestSchema, {
        image: new Uint8Array(MAX_RECEIPT_IMAGE_BYTES),
        mediaType: "image/jpeg",
        consentVersion: "1",
        currency: "USD",
      }),
    ).length;

    expect(size).toBeLessThan(RECEIPT_READ_MAX_BYTES);
  });

  it("keep everything else under the default: a new group born with the most members", () => {
    const size = toBinary(
      CreateGroupRequestSchema,
      create(CreateGroupRequestSchema, {
        name: "g".repeat(MAX_GROUP_NAME_LENGTH),
        type: "trip",
        currency: "USD",
        memberIds: Array.from({ length: MAX_GROUP_MEMBER_IDS_PER_REQUEST }, (_unused, index) => userId(index)),
      }),
    ).length;

    expect(size).toBeLessThan(DEFAULT_READ_MAX_BYTES);
  });

  it("keep a payment method under the default: every detail a form allows, every field at its limit", () => {
    const size = toBinary(
      CreatePaymentMethodRequestSchema,
      create(CreatePaymentMethodRequestSchema, {
        name: "m".repeat(MAX_PAYMENT_METHOD_NAME_LENGTH),
        currency: "USD",
        preset: "bank",
        details: Array.from({ length: MAX_PAYMENT_DETAILS_PER_METHOD }, () => ({
          kind: "custom",
          label: "l".repeat(MAX_PAYMENT_DETAIL_LABEL_LENGTH),
          value: "v".repeat(MAX_PAYMENT_DETAIL_VALUE_LENGTH),
        })),
        note: "n".repeat(MAX_PAYMENT_METHOD_NOTE_LENGTH),
        preferred: true,
      }),
    ).length;

    expect(size).toBeLessThan(DEFAULT_READ_MAX_BYTES);
  });
});
