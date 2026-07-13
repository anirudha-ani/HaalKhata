/** Receipt-parsing business logic: provider fallback chain (Anthropic → local → mock), normalized to integer cents. */

import Anthropic from "@anthropic-ai/sdk";
import { invalid } from "@/server/common/errors";
import {
  ANTHROPIC_MODEL,
  IMAGE_MAGIC_BYTES,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  PROMPT,
  RECEIPT_JSON_SCHEMA,
  type ImageMediaType,
} from "@/server/receipt/receipt.constants";

/** A receipt extracted from an image, with all money amounts as integer cents. */
export interface ParsedReceiptData {
  merchant: string;
  /** Purchase date as "YYYY-MM-DD"; empty string when unreadable. */
  date: string;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** Purchasable line items only; subtotal/tax/tip/total live in their own fields. */
  items: { name: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  subtotalCents: number;
  /** All taxes combined; 0 when absent. */
  taxCents: number;
  /** Tip or service charge; 0 when absent. */
  tipCents: number;
  totalCents: number;
}

/** One receipt-parsing backend in the fallback chain. */
interface Provider {
  /** Short identifier reported back to the client and used in RECEIPT_AI_PROVIDERS. */
  name: string;
  /** Whether the provider's configuration (API keys, URLs) is present. */
  available(): boolean;
  /** Extracts a receipt from a base64-encoded image of the given media type. */
  parse(imageBase64: string, mediaType: ImageMediaType): Promise<ParsedReceiptData>;
}

/**
 * Accepts loosely-shaped provider output and normalizes it to safe integers:
 * clamps negatives, drops zero-total items, and derives missing unit prices,
 * subtotals and totals from what is present.
 *
 * @param rawOutput - Whatever JSON the provider produced (snake_case or camelCase keys).
 * @returns A fully populated ParsedReceiptData with consistent integer-cent amounts.
 */
function normalize(rawOutput: unknown): ParsedReceiptData {
  const rawRecord = (typeof rawOutput === "object" && rawOutput !== null ? rawOutput : {}) as Record<string, unknown>;
  const toNonNegativeInteger = (value: unknown): number =>
    Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  const toTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

  const items = (Array.isArray(rawRecord.items) ? rawRecord.items : [])
    .map((rawItem) => {
      const itemRecord = (typeof rawItem === "object" && rawItem !== null ? rawItem : {}) as Record<string, unknown>;
      const quantity = Math.max(1, toNonNegativeInteger(itemRecord.quantity ?? itemRecord.qty ?? 1));
      const unitPrice = toNonNegativeInteger(itemRecord.unit_price_cents ?? itemRecord.unitPriceCents);
      let lineTotal = toNonNegativeInteger(itemRecord.total_cents ?? itemRecord.totalCents);
      if (lineTotal === 0 && unitPrice > 0) lineTotal = unitPrice * quantity;
      return {
        name: toTrimmedString(itemRecord.name) || "Item",
        quantity,
        unitPriceCents: unitPrice > 0 ? unitPrice : Math.round(lineTotal / quantity),
        totalCents: lineTotal,
      };
    })
    .filter((parsedItem) => parsedItem.totalCents > 0);

  const itemsTotal = items.reduce((runningTotal, parsedItem) => runningTotal + parsedItem.totalCents, 0);
  const taxCents = toNonNegativeInteger(rawRecord.tax_cents ?? rawRecord.taxCents);
  const tipCents = toNonNegativeInteger(rawRecord.tip_cents ?? rawRecord.tipCents);
  let subtotal = toNonNegativeInteger(rawRecord.subtotal_cents ?? rawRecord.subtotalCents);
  if (subtotal === 0) subtotal = itemsTotal;
  let total = toNonNegativeInteger(rawRecord.total_cents ?? rawRecord.totalCents);
  if (total === 0) total = subtotal + taxCents + tipCents;

  return {
    merchant: toTrimmedString(rawRecord.merchant),
    date: toTrimmedString(rawRecord.date),
    currency: (toTrimmedString(rawRecord.currency) || "USD").toUpperCase().slice(0, 3),
    items,
    subtotalCents: subtotal,
    taxCents,
    tipCents,
    totalCents: total,
  };
}

// --- providers ---------------------------------------------------------------

/**
 * Parses a JSON string with a clear error message on failure, instead of the
 * opaque "Unexpected token..." that JSON.parse throws. Used for all provider
 * output so the failover-chain error log stays readable.
 *
 * @param text - Raw text the provider returned.
 * @param providerName - Name used in the thrown error for debugging.
 * @returns The parsed value.
 * @throws Error with a descriptive message when the text is not valid JSON.
 */
function safeJsonParse(text: string, providerName: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${providerName} returned non-JSON output (length ${text.length})`);
  }
}

/**
 * Extracts the first balanced `{ ... }` JSON object from text that may contain
 * markdown fences, prose, or trailing commentary. Tracks brace depth so nested
 * objects and `}` inside strings are handled better than a naive indexOf/lastIndexOf.
 *
 * @param text - Raw text potentially containing a JSON object.
 * @returns The extracted object string, or the original text if no braces found.
 */
function extractJsonObject(text: string): string {
  const startIndex = text.indexOf("{");
  if (startIndex === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth++;
    else if (character === "}") {
      depth--;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  return text.slice(startIndex);
}

/** Anthropic vision model with structured (JSON-schema) output; needs ANTHROPIC_API_KEY. */
const anthropicProvider: Provider = {
  name: "anthropic",
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async parse(imageBase64, mediaType) {
    const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      output_config: { format: { type: "json_schema", schema: RECEIPT_JSON_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      throw new Error("cloud provider declined to process this image");
    }
    const text = response.content.find((contentBlock) => contentBlock.type === "text")?.text ?? "";
    return normalize(safeJsonParse(text, "anthropic"));
  },
};

/** Self-hosted vision box speaking the OpenAI-compatible wire format. */
const localProvider: Provider = {
  name: "local",
  available: () => Boolean(process.env.LOCAL_AI_BASE_URL),
  async parse(imageBase64, mediaType) {
    const baseUrl = process.env.LOCAL_AI_BASE_URL!.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        "content-type": "application/json",
        ...(process.env.LOCAL_AI_API_KEY
          ? { authorization: `Bearer ${process.env.LOCAL_AI_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: process.env.LOCAL_AI_MODEL ?? "qwen2.5vl",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
              { type: "text", text: `${PROMPT}\nRespond with ONLY the JSON object.` },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`local provider returned ${response.status}`);
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJsonObject(text);
    return normalize(safeJsonParse(jsonText, "local"));
  },
};

/** Deterministic sample so the scan flow is demoable without any API keys. */
const mockProvider: Provider = {
  name: "mock",
  available: () => true,
  async parse() {
    return normalize({
      merchant: "Demo Diner",
      date: new Date().toISOString().slice(0, 10),
      currency: "USD",
      items: [
        { name: "Margherita pizza", quantity: 1, unit_price_cents: 1450, total_cents: 1450 },
        { name: "Chicken burger", quantity: 2, unit_price_cents: 995, total_cents: 1990 },
        { name: "Fries (large)", quantity: 1, unit_price_cents: 450, total_cents: 450 },
        { name: "Lemonade", quantity: 3, unit_price_cents: 300, total_cents: 900 },
      ],
      subtotal_cents: 4790,
      tax_cents: 419,
      tip_cents: 800,
      total_cents: 6009,
    });
  },
};

/** Every known provider, keyed by the name used in RECEIPT_AI_PROVIDERS. */
const PROVIDERS: Record<string, Provider> = {
  anthropic: anthropicProvider,
  local: localProvider,
  mock: mockProvider,
};

/**
 * Builds the ordered list of usable providers from the RECEIPT_AI_PROVIDERS
 * env var (default "anthropic,local,mock"), keeping only configured ones.
 *
 * @returns Providers to try, in fallback order.
 */
function providerChain(): Provider[] {
  const order = (process.env.RECEIPT_AI_PROVIDERS ?? "anthropic,local,mock")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return order.map((name) => PROVIDERS[name]).filter((provider) => provider?.available());
}

/**
 * Parses a receipt image by trying each configured provider in order until one
 * returns at least one line item.
 *
 * @param image - Raw image bytes uploaded by the client.
 * @param mediaType - MIME type of the image; must be one of IMAGE_MEDIA_TYPES.
 * @returns The normalized receipt plus the name of the provider that produced it.
 * @throws UsecaseError "invalid_argument" when the image is empty, too large, or of an
 *   unsupported type; when no provider is configured; or when every provider fails.
 */
export async function parseReceipt(
  image: Uint8Array,
  mediaType: string,
): Promise<{ receipt: ParsedReceiptData; provider: string }> {
  if (image.length === 0) invalid("no image provided");
  if (image.length > MAX_IMAGE_BYTES) invalid("image is too large (max 8 MB)");
  if (!IMAGE_MEDIA_TYPES.includes(mediaType as ImageMediaType)) {
    invalid("unsupported image type — use JPEG, PNG, WebP or GIF");
  }
  // Verify the actual bytes match the declared media type so a mislabeled or
  // malicious upload (e.g. an SVG with embedded script) can't slip through.
  const expectedMagic = IMAGE_MAGIC_BYTES[mediaType as ImageMediaType];
  for (let index = 0; index < expectedMagic.length; index++) {
    if (image[index] !== expectedMagic[index]) {
      invalid("image bytes do not match the declared media type");
    }
  }

  const chain = providerChain();
  if (chain.length === 0) invalid("no receipt AI provider is configured");

  const imageBase64 = Buffer.from(image).toString("base64");
  const errors: string[] = [];
  for (const provider of chain) {
    try {
      const receipt = await provider.parse(imageBase64, mediaType as ImageMediaType);
      if (receipt.items.length === 0) throw new Error("no line items detected");
      return { receipt, provider: provider.name };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  invalid(`could not parse the receipt (${errors.join("; ")})`);
}
