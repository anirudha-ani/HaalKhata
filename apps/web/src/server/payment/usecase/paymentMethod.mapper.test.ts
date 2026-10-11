/** Unit tests for mapping stored payment methods to what leaves the server. */

import { describe, expect, test } from "vitest";
import type { PaymentMethodRow } from "@/server/payment/repo/paymentMethods.repo";
import { cleanMethodRow, toPaymentMethod } from "./paymentMethod.mapper";

/**
 * Builds a stored method, as a row the validator never saw might look.
 *
 * @param overrides - Columns to replace on the default row.
 * @returns A complete row.
 */
function rowWith(overrides: Partial<PaymentMethodRow>): PaymentMethodRow {
  return {
    id: "method-1",
    user_id: "user-1",
    name: "Chase checking",
    currency: "USD",
    preset: null,
    note: "",
    is_preferred: false,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    details: [{ kind: "account_number", label: "", value: "000123456789" }],
    ...overrides,
  };
}

describe("cleanMethodRow", () => {
  test("a row copied in by the backfill leaves without its hidden characters", () => {
    const cleaned = cleanMethodRow(
      rowWith({
        name: "Zelle ‮knab",
        note: "send​ here",
        details: [
          { kind: "account_number", label: "", value: "123‮456789" },
          { kind: "custom", label: "Bra​nch", value: "Gul⁠shan" },
        ],
      }),
    );
    expect(cleaned.name).toBe("Zelle knab");
    expect(cleaned.note).toBe("send here");
    expect(cleaned.details).toEqual([
      { kind: "account_number", label: "", value: "123456789" },
      { kind: "custom", label: "Branch", value: "Gulshan" },
    ]);
  });

  test("words keep the joiner their script needs, an identifier does not", () => {
    const word = "র‍্য";
    const cleaned = cleanMethodRow(
      rowWith({
        name: word,
        details: [
          { kind: "account_name", label: "", value: word },
          { kind: "username", label: "", value: word },
        ],
      }),
    );
    expect(cleaned.name).toBe(word);
    expect(cleaned.details[0]!.value).toBe(word);
    expect(cleaned.details[1]!.value).toBe("র্য");
  });

  test("a clean row is returned with the same content", () => {
    const stored = rowWith({});
    expect(cleanMethodRow(stored)).toEqual(stored);
  });
});

describe("toPaymentMethod", () => {
  test("spells a missing currency and preset as empty strings and sends the cleaned text", () => {
    const message = toPaymentMethod(
      rowWith({ currency: null, preset: null, name: "bKash​", is_preferred: true }),
    );
    expect(message).toMatchObject({
      id: "method-1",
      name: "bKash",
      currency: "",
      preset: "",
      preferred: true,
    });
  });
});
