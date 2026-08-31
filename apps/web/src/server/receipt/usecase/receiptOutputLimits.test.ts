/** Regression tests for treating vision-model receipt output as untrusted data. */

import { describe, expect, it } from "vitest";
import {
  MAX_PARSED_ITEMS,
  MAX_PARSED_MONEY_CENTS,
  MAX_PARSED_NAME_LENGTH,
  MAX_PARSED_QUANTITY,
  MAX_PROVIDER_RESPONSE_BYTES,
} from "@/server/receipt/receipt.constants";
import { normalizeProviderOutput, readProviderResponse } from "./receipt.usecase";

describe("receipt provider output limits", () => {
  it("caps model-controlled array and string sizes", () => {
    const receipt = normalizeProviderOutput({
      merchant: "M".repeat(MAX_PARSED_NAME_LENGTH + 50),
      items: Array.from({ length: MAX_PARSED_ITEMS + 50 }, (_unusedValue, index) => ({
        name: `${index}`.repeat(MAX_PARSED_NAME_LENGTH + 50),
        quantity: 1,
        total_cents: 100,
      })),
    });

    expect(receipt.items).toHaveLength(MAX_PARSED_ITEMS);
    expect(receipt.merchant).toHaveLength(MAX_PARSED_NAME_LENGTH);
    expect(receipt.items.every((item) => item.name.length <= MAX_PARSED_NAME_LENGTH)).toBe(true);
  });

  it("caps direct and derived numeric magnitudes", () => {
    const receipt = normalizeProviderOutput({
      items: [
        {
          name: "Injected amount",
          quantity: 1e300,
          unit_price_cents: 1e300,
          total_cents: 0,
        },
      ],
      subtotal_cents: 1e300,
      tax_cents: 1e300,
      tip_cents: 1e300,
      total_cents: 1e300,
    });

    expect(receipt.items[0]).toMatchObject({
      quantity: MAX_PARSED_QUANTITY,
      unitPriceCents: MAX_PARSED_MONEY_CENTS,
      totalCents: MAX_PARSED_MONEY_CENTS,
    });
    expect(receipt.subtotalCents).toBe(MAX_PARSED_MONEY_CENTS);
    expect(receipt.taxCents).toBe(MAX_PARSED_MONEY_CENTS);
    expect(receipt.tipCents).toBe(MAX_PARSED_MONEY_CENTS);
    expect(receipt.totalCents).toBe(MAX_PARSED_MONEY_CENTS);
  });

  it("keeps only provider dates that exist in the calendar", () => {
    expect(normalizeProviderOutput({ date: "2028-02-29" }).date).toBe("2028-02-29");
    expect(normalizeProviderOutput({ date: "2026-02-29" }).date).toBe("");
    expect(normalizeProviderOutput({ date: "02/29/2026 11:41 AM" }).date).toBe("");
  });

  it("rejects a provider response whose declared size exceeds the cap", async () => {
    const response = new Response("{}", {
      headers: { "content-length": String(MAX_PROVIDER_RESPONSE_BYTES + 1) },
    });

    await expect(readProviderResponse(response)).rejects.toThrow(/response exceeds/);
  });

  it("stops streaming when a provider understates or omits its response size", async () => {
    const response = new Response(new Uint8Array(MAX_PROVIDER_RESPONSE_BYTES + 1));

    await expect(readProviderResponse(response)).rejects.toThrow(/response exceeds/);
  });
});
