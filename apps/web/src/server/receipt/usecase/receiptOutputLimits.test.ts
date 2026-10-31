/** Regression tests for treating vision-model receipt output as untrusted data. */

import { describe, expect, it } from "vitest";
import {
  MAX_PARSED_ITEMS,
  MAX_PARSED_MONEY_CENTS,
  MAX_PARSED_NAME_LENGTH,
  MAX_PARSED_QUANTITY,
  MAX_PROVIDER_RESPONSE_BYTES,
  RECEIPT_JSON_SCHEMA,
} from "@/server/receipt/receipt.constants";
import { normalizeProviderOutput, readProviderResponse } from "./receipt.usecase";

/**
 * A provider body that keeps sending until it is cancelled, and records
 * whether it was: an oversized reply left neither read nor cancelled holds
 * its connection until garbage collection.
 *
 * @returns The body and a check of whether it was cancelled.
 */
function endlessTrackedBody() {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, wasCancelled: () => cancelled };
}

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

  it("cancels the body of a reply refused for its declared size, freeing the connection", async () => {
    const tracked = endlessTrackedBody();
    const response = new Response(tracked.body, {
      headers: { "content-length": String(MAX_PROVIDER_RESPONSE_BYTES + 1) },
    });

    await expect(readProviderResponse(response)).rejects.toThrow(/response exceeds/);
    expect(tracked.wasCancelled()).toBe(true);
  });

  it("cancels the body of a reply that streams past the cap", async () => {
    const tracked = endlessTrackedBody();

    await expect(readProviderResponse(new Response(tracked.body))).rejects.toThrow(/response exceeds/);
    expect(tracked.wasCancelled()).toBe(true);
  });

  it("keeps the structured-output schema to keywords the vision provider accepts", () => {
    // Gemini, behind OpenRouter, answers a bare INVALID_ARGUMENT to a schema
    // containing maxItems, which took every receipt scan down. The server
    // enforces MAX_PARSED_ITEMS itself, so the schema does not need it.
    const acceptedKeywords = new Set([
      "type", "description", "properties", "required", "additionalProperties",
      "items", "maxLength", "minimum", "maximum",
    ]);
    const collectKeywords = (node: unknown): string[] => {
      if (typeof node !== "object" || node === null) return [];
      if (Array.isArray(node)) return node.flatMap(collectKeywords);
      return Object.entries(node as Record<string, unknown>).flatMap(([keyword, value]) =>
        keyword === "properties"
          ? [keyword, ...Object.values(value as Record<string, unknown>).flatMap(collectKeywords)]
          : [keyword, ...collectKeywords(value)],
      );
    };

    const rejected = collectKeywords(RECEIPT_JSON_SCHEMA).filter(
      (keyword) => !acceptedKeywords.has(keyword),
    );

    expect(rejected).toEqual([]);
  });
});

it.each([
  ["USD", "12.99", 1299], ["INR", "120.50", 12050],
  ["JPY", "1200", 1200], ["KWD", "1.234", 1234],
])("normalizes printed %s amounts to that currency's minor units", (currency, printed, expected) => {
  const receipt = normalizeProviderOutput({ currency, items: [{ name: "Meal", quantity: 2, unit_price: printed, total: printed }],
    subtotal: printed, tax: printed, tip: printed, total: printed });
  expect(receipt.items[0].unitPriceCents).toBe(expected);
  expect(receipt.items[0].totalCents).toBe(expected);
  expect([receipt.subtotalCents, receipt.taxCents, receipt.tipCents, receipt.totalCents]).toEqual(Array(4).fill(expected));
});

it.each(["", "$", "¥", "ZZZ"])("uses the form currency for ambiguous provider currency %s", (currency) => {
  expect(normalizeProviderOutput({ currency, items: [{ name: "Meal", total: "1200" }] }, "JPY"))
    .toMatchObject({ currency: "JPY", totalCents: 1200 });
  expect(normalizeProviderOutput({ currency, total: "1.234" }, "KWD")).toMatchObject({ currency: "KWD", totalCents: 1234 });
});

it("keeps a confidently different receipt currency and bounds decimal-string amounts", () => {
  expect(normalizeProviderOutput({ currency: "USD", total: "12.99" }, "INR"))
    .toMatchObject({ currency: "USD", totalCents: 1299 });
  expect(normalizeProviderOutput({ total: "999999999999999999999.00" }).totalCents).toBe(MAX_PARSED_MONEY_CENTS);
  expect(normalizeProviderOutput({ total: "1e9" }).totalCents).toBe(0);
  expect(normalizeProviderOutput({ total: "-123" }).totalCents).toBe(0);
  expect(normalizeProviderOutput({ currency: "JPY", total_cents: 120000 }).totalCents).toBe(1200);
  expect(normalizeProviderOutput({ currency: "KWD", total_cents: 123 }).totalCents).toBe(1230);
});
