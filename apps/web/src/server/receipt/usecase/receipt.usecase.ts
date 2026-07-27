/**
 * Receipt-parsing business logic: provider fallback chain
 * (compatible → mock), normalized to integer cents.
 *
 * There is deliberately no provider-specific SDK here. OpenRouter fronts every
 * model worth using for this — Claude and Gemini included — behind one
 * OpenAI-compatible endpoint and one key, so a second vendor client would buy
 * nothing but another dependency and another secret to manage.
 *
 * The uploaded image is never persisted — it lives in memory for the length of
 * one request and is discarded. Only the extracted structured data is saved,
 * so the whole privacy surface is transit plus provider retention (see
 * docs/plan.txt §6b).
 */

import heicConvert from "heic-convert";
import sharp from "sharp";
import { invalid } from "@/server/common/errors";
import { logEvent } from "@/server/common/logger";
import {
  COMPATIBLE_AI,
  HEIF_BRANDS,
  IMAGE_MEDIA_TYPES,
  IMAGE_SIGNATURES,
  JPEG_QUALITY,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE_PIXELS,
  PROMPT,
  PROVIDER_TIMEOUT_MS,
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
/**
 * Coerces whatever date string a model returned into the strict `YYYY-MM-DD`
 * the expense API requires, or "" when it cannot be read confidently.
 *
 * Models ignore the format instruction often enough to matter — an observed
 * response was `"1/17/26 11:41 AM"`, which the expense usecase rejects outright
 * (ISO_DATE_PATTERN) and an `<input type="date">` cannot display, so the whole
 * save failed. Returning "" instead just leaves today's date in the form.
 *
 * Ambiguous numeric dates are read month-first: this is a US-first product
 * (see docs/plan.txt §4b) and the alternative is silently filing an expense
 * under the wrong day.
 *
 * @param value - Raw date string from the provider.
 * @returns An ISO calendar date, or "" when unparseable.
 */
function toIsoDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Embedded ISO date, e.g. "2026-01-17 11:41" or "2026-01-17T11:41:00Z".
  const embedded = /(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (embedded) return `${embedded[1]}-${embedded[2]}-${embedded[3]}`;

  // Month-first numeric, e.g. "1/17/26", "01-17-2026 11:41 AM".
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/.exec(trimmed);
  if (numeric) {
    const month = Number(numeric[1]);
    const dayOfMonth = Number(numeric[2]);
    const yearPart = numeric[3];
    const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
    if (month >= 1 && month <= 12 && dayOfMonth >= 1 && dayOfMonth <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    }
  }
  return "";
}

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
    // Keep zero-priced rows as long as they are named. A model that splits
    // "Toasted Bagel / with cream cheese $7.00" across two lines puts the price
    // on the modifier, so dropping the zero row would delete the actual item
    // and leave an orphaned "with cream cheese" behind. A visible $0.00 row is
    // something the reviewer can fix; a silently missing item is not.
    .filter((parsedItem) => parsedItem.totalCents > 0 || parsedItem.name !== "Item");

  const itemsTotal = items.reduce((runningTotal, parsedItem) => runningTotal + parsedItem.totalCents, 0);
  const taxCents = toNonNegativeInteger(rawRecord.tax_cents ?? rawRecord.taxCents);
  const tipCents = toNonNegativeInteger(rawRecord.tip_cents ?? rawRecord.tipCents);
  let subtotal = toNonNegativeInteger(rawRecord.subtotal_cents ?? rawRecord.subtotalCents);
  if (subtotal === 0) subtotal = itemsTotal;
  let total = toNonNegativeInteger(rawRecord.total_cents ?? rawRecord.totalCents);
  if (total === 0) total = subtotal + taxCents + tipCents;

  return {
    merchant: toTrimmedString(rawRecord.merchant),
    date: toIsoDate(toTrimmedString(rawRecord.date)),
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

/**
 * Any endpoint speaking the OpenAI `/chat/completions` wire format — in
 * production, OpenRouter. Swapping the underlying model (Gemini, Claude,
 * anything else) is a change to COMPATIBLE_AI_MODEL, not a code change.
 *
 * When COMPATIBLE_AI_ZDR is set, the request carries `zdr: true`, which
 * restricts routing to endpoints holding a zero-data-retention policy. Since
 * receipts are other people's financial records and this is the only hop where
 * they leave our server, prefer *also* enforcing ZDR account-wide in
 * OpenRouter — that fails closed if a request ever omits the flag.
 */
const compatibleProvider: Provider = {
  name: "compatible",
  available: () => Boolean(COMPATIBLE_AI.baseUrl && COMPATIBLE_AI.model),
  async parse(imageBase64, mediaType) {
    const response = await fetch(`${COMPATIBLE_AI.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        ...(COMPATIBLE_AI.apiKey
          ? { authorization: `Bearer ${COMPATIBLE_AI.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: COMPATIBLE_AI.model,
        // Constrain the shape, not just "some JSON". Models that don't support
        // json_schema reject this outright — the error body is surfaced below,
        // so the fix (a different model, or json_object) is obvious rather than
        // showing up as silently malformed output.
        response_format: {
          type: "json_schema",
          json_schema: { name: "receipt", strict: true, schema: RECEIPT_JSON_SCHEMA },
        },
        // OpenRouter-specific, so only sent when explicitly enabled — a
        // stricter OpenAI-compatible server may reject an unknown body key.
        ...(COMPATIBLE_AI.zeroDataRetention ? { zdr: true } : {}),
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
    if (!response.ok) {
      // Surface the body: a ZDR-enforced request to a model with no
      // zero-retention endpoint fails here, and "returned 404" alone would
      // send you hunting for a networking problem that doesn't exist.
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(
        `compatible provider returned ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJsonObject(text);
    return normalize(safeJsonParse(jsonText, "compatible"));
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
  compatible: compatibleProvider,
  mock: mockProvider,
};

/**
 * Builds the ordered list of providers to try from the RECEIPT_AI_PROVIDERS
 * env var.
 *
 * The mock is used only when NO real provider is configured — it exists so an
 * unconfigured dev box can still demo the scan flow. It is deliberately not a
 * fallback: handing back "Demo Diner" because a key was missing or the API
 * call failed looks like a successful scan of the wrong receipt, which is far
 * worse than an error. A real provider that is misconfigured or failing
 * therefore surfaces as a failure.
 *
 * @returns The providers to try in order, plus the names of real providers
 *   that were asked for but are not configured.
 */
function providerChain(): { chain: Provider[]; unconfigured: string[] } {
  const order = (process.env.RECEIPT_AI_PROVIDERS ?? "compatible,mock")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const requested = order.flatMap((name) => {
    const provider = PROVIDERS[name];
    return provider ? [provider] : [];
  });
  const real = requested.filter((provider) => provider.name !== mockProvider.name);
  const configured = real.filter((provider) => provider.available());
  const unconfigured = real
    .filter((provider) => !provider.available())
    .map((provider) => provider.name);
  if (configured.length > 0) return { chain: configured, unconfigured };
  const wantsMock = requested.some((provider) => provider.name === mockProvider.name);
  return { chain: wantsMock ? [mockProvider] : [], unconfigured };
}

/**
 * Identifies the image format from its magic bytes, ignoring whatever the
 * client claimed.
 *
 * The declared type cannot be trusted: browsers have no MIME mapping for HEIC
 * and report an empty string for it, so a perfectly valid iPhone photo arrives
 * labelled `""`. Sniffing the bytes is both more permissive (it accepts files
 * the browser could not name) and stricter (a `.png` full of script is
 * recognised for what it is), so it replaces the declared-type check entirely.
 *
 * @param image - Raw uploaded bytes.
 * @returns The detected media type, or null when the bytes are not a supported image.
 */
function detectImageFormat(image: Uint8Array): ImageMediaType | null {
  for (const mediaType of IMAGE_MEDIA_TYPES) {
    const matches = IMAGE_SIGNATURES[mediaType].some((signature) =>
      signature.bytes.every((byte, index) => image[signature.offset + index] === byte),
    );
    if (!matches) continue;
    // HEIF containers also hold video and image sequences; the brand at offset
    // 8 distinguishes still photos, which are the only ones worth transcoding.
    if (mediaType === "image/heic" || mediaType === "image/heif") {
      const brand = Buffer.from(image.slice(8, 12)).toString("latin1");
      if (!HEIF_BRANDS.includes(brand)) return null;
    }
    return mediaType;
  }
  return null;
}

/**
 * Decodes a HEIC/HEIF still to JPEG bytes.
 *
 * This does NOT go through sharp. sharp bundles libheif 1.23, whose security
 * limits cap an `iref` box at 16 references — and real iPhone photos carry ~48
 * (HDR gain map, depth map, thumbnails), so every one of them fails to decode
 * with "Security limit exceeded". libheif does not expose that limit through
 * libvips, so there is no option to relax.
 *
 * heic-convert bundles its own libheif build without that cap and decodes the
 * same files at full resolution. ffmpeg also decodes them, but returns a
 * half-size preview image rather than the primary one — worse for small
 * receipt print, and a system dependency besides.
 *
 * @param image - Raw HEIC/HEIF bytes.
 * @returns Decoded JPEG bytes, orientation already applied to the pixels.
 */
async function decodeHeicToJpeg(image: Uint8Array): Promise<Buffer> {
  return Buffer.from(
    await heicConvert({ buffer: image, format: "JPEG", quality: 0.92 }),
  );
}

/**
 * Transcodes any accepted upload into the JPEG the vision providers actually
 * take, and returns it base64-encoded.
 *
 * Three things happen here, all of which matter for receipts:
 *  - **HEIC becomes JPEG.** iPhones shoot HEIC by default and no vision API
 *    accepts it, so without this every default iPhone photo fails.
 *  - **EXIF rotation is applied.** Phone cameras record orientation as metadata
 *    rather than rotating pixels; providers read pixels, so a sideways receipt
 *    would otherwise be transcribed sideways. (HEIC arrives already oriented
 *    from the decoder, so this is a no-op for that path.)
 *  - **The long edge is capped.** Anything beyond what the model uses is
 *    downsampled on their side anyway, so sending it only costs upload time.
 *
 * Every format goes through the sharp stage, not just HEIC — the orientation
 * fix and size cap are worth just as much on a JPEG straight off a phone.
 *
 * @param image - Raw uploaded bytes, already validated.
 * @param format - Format detected from the bytes by {@link detectImageFormat}.
 * @returns The JPEG bytes, which are both sent to the provider (base64) and
 *   handed back to the client so it can show what the model actually read.
 * @throws UsecaseError (invalid_argument) when the bytes cannot be decoded as an image.
 */
async function normalizeToJpeg(image: Uint8Array, format: ImageMediaType): Promise<Buffer> {
  try {
    const decoded =
      format === "image/heic" || format === "image/heif"
        ? await decodeHeicToJpeg(image)
        : Buffer.from(image);
    const jpeg = await sharp(decoded)
      .rotate() // no argument = apply the EXIF orientation tag
      .resize({
        width: MAX_IMAGE_EDGE_PIXELS,
        height: MAX_IMAGE_EDGE_PIXELS,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return jpeg;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    invalid(`could not read that image (${detail})`);
  }
}

/**
 * Parses a receipt image by trying each configured provider in order until one
 * returns at least one line item.
 *
 * The format is detected from the bytes; the request's `media_type` field is
 * ignored because browsers report an empty string for HEIC.
 *
 * @param image - Raw image bytes uploaded by the client.
 * @returns The normalized receipt, the name of the provider that produced it,
 *   and the JPEG that provider was shown, for the client to display alongside
 *   the extracted values.
 * @throws UsecaseError "invalid_argument" when the image is empty, too large, or not a
 *   supported image; when no provider is configured; or when every provider fails.
 */
export async function parseReceipt(
  image: Uint8Array,
): Promise<{ receipt: ParsedReceiptData; provider: string; normalizedImage: Uint8Array }> {
  if (image.length === 0) invalid("no image provided");
  if (image.length > MAX_IMAGE_BYTES) invalid("image is too large (max 8 MB)");
  // The client's declared media type is advisory only — see detectImageFormat.
  const format = detectImageFormat(image);
  if (format === null) {
    invalid("that file isn't a supported image — use JPEG, PNG, WebP, GIF or HEIC");
  }

  const { chain, unconfigured } = providerChain();
  if (chain.length === 0) {
    invalid(
      unconfigured.length > 0
        ? `receipt AI is not configured — ${unconfigured.join(", ")} needs COMPATIBLE_AI_BASE_URL and COMPATIBLE_AI_MODEL`
        : "no receipt AI provider is configured",
    );
  }
  // Loud, because the result looks like a real scan: a dev box that should be
  // calling a real provider but isn't will otherwise just quietly invent a bill.
  if (chain[0] === mockProvider) {
    logEvent("warn", "receipt scan is using the mock provider — no real provider is configured", {
      requested: process.env.RECEIPT_AI_PROVIDERS ?? "compatible,mock",
      unconfigured,
    });
  }

  const normalizedImage = await normalizeToJpeg(image, format);
  const imageBase64 = normalizedImage.toString("base64");
  const errors: string[] = [];
  for (const provider of chain) {
    try {
      const receipt = await provider.parse(imageBase64, "image/jpeg");
      if (receipt.items.length === 0) throw new Error("no line items detected");
      return { receipt, provider: provider.name, normalizedImage };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  invalid(`could not parse the receipt (${errors.join("; ")})`);
}
