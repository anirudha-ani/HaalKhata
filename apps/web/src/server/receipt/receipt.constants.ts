/** Receipt domain constants: accepted image types, size limit, extraction schema + prompt. */

/** Image formats accepted from clients (also the set the Anthropic API accepts). */
export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/** Upper bound on uploaded image size (8 MB). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Anthropic model used by the cloud provider. Configurable via env so a
 * deprecated snapshot alias can be swapped without a code change.
 */
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/**
 * Magic-byte signatures for each accepted image format, used to verify the
 * client-supplied mediaType matches the actual bytes (defense against a
 * mislabeled or malicious upload).
 */
export const IMAGE_MAGIC_BYTES: Record<ImageMediaType, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // "RIFF" (WebP container)
  "image/gif": [0x47, 0x49, 0x46], // "GIF"
};

/** JSON schema the cloud provider's structured output must conform to. */
export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant", "date", "currency", "items",
    "subtotal_cents", "tax_cents", "tip_cents", "total_cents",
  ],
  properties: {
    merchant: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD, empty string if unreadable" },
    currency: { type: "string", description: "ISO 4217 code, e.g. USD" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit_price_cents", "total_cents"],
        properties: {
          name: { type: "string" },
          quantity: { type: "integer" },
          unit_price_cents: { type: "integer" },
          total_cents: { type: "integer" },
        },
      },
    },
    subtotal_cents: { type: "integer" },
    tax_cents: { type: "integer" },
    tip_cents: { type: "integer" },
    total_cents: { type: "integer" },
  },
} as const;

/** Extraction instructions shared by every vision provider. */
export const PROMPT = `Extract this receipt into the JSON schema. All money values are integer cents (e.g. $12.99 -> 1299). Rules:
- Every purchasable line item goes in items; use total_cents = quantity * unit_price_cents when both are printed, otherwise put the printed line total in total_cents.
- Do NOT include subtotal, tax, tip or total lines as items — they go in their own fields.
- tax_cents covers all taxes combined; tip_cents covers tip/service charge; 0 when absent.
- If a value is unreadable, use 0 (or "" for strings). Guess the currency from symbols or locale.`;
