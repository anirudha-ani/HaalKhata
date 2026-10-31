/**
 * Receipt-parsing business logic: provider selection, the upload checks (the
 * photo arrives prepared by the app and is only checked, in `image/`), and
 * untrusted provider output normalized to integer currency minor units.
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

import { currencyInfo, minorUnitDigits } from "@haalkhata/shared/money/money.constants";
import {
  MAX_RECEIPT_IMAGE_BYTES,
  RECEIPT_IMAGE_MEDIA_TYPE,
} from "@haalkhata/shared/receipt/receipt.constants";
import { invalid, unavailable } from "@/server/common/errors";
import { isRealCalendarDate } from "@/server/common/validation/validation";
import { logError, logEvent } from "@/server/common/logger";
import {
  insertReceiptScan,
  type ReceiptScanOutcome,
} from "@/server/receipt/repo/receiptScans.repo";
import {
  COMPATIBLE_AI,
  MAX_PARSED_ITEMS,
  MAX_PARSED_MONEY_CENTS,
  MAX_PARSED_NAME_LENGTH,
  MAX_PARSED_QUANTITY,
  MAX_PROVIDER_RESPONSE_BYTES,
  PROMPT,
  PROVIDER_TIMEOUT_MS,
  RECEIPT_JSON_SCHEMA,
} from "@/server/receipt/receipt.constants";
import { acceptPreparedJpeg } from "./image/preparedJpeg";
import { scanStoppedError } from "./scanLanes/scanLanes";

/** A receipt extracted from an image, with all money amounts in the currency's integer minor units. */
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
  /**
   * Extracts a receipt from a base64-encoded prepared JPEG, giving up when
   * `signal` aborts (the scan stopped).
   */
  parse(imageBase64: string, currency: string, signal: AbortSignal): Promise<ParsedReceiptData>;
}

/** One normalized line item in a parsed receipt. */
type ParsedReceiptItem = ParsedReceiptData["items"][number];

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
  if (isRealCalendarDate(trimmed)) return trimmed;

  // Embedded ISO date, e.g. "2026-01-17 11:41" or "2026-01-17T11:41:00Z".
  const embedded = /(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (embedded) {
    const candidate = `${embedded[1]}-${embedded[2]}-${embedded[3]}`;
    if (isRealCalendarDate(candidate)) return candidate;
  }

  // Month-first numeric, e.g. "1/17/26", "01-17-2026 11:41 AM".
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/.exec(trimmed);
  if (numeric) {
    const month = Number(numeric[1]);
    const dayOfMonth = Number(numeric[2]);
    const yearPart = numeric[3];
    const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
    const candidate = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    if (isRealCalendarDate(candidate)) return candidate;
  }
  return "";
}

/**
 * Coerces an untrusted provider value to a non-negative bounded integer.
 *
 * @param value - Raw provider value.
 * @param maximum - Largest accepted integer.
 * @returns Rounded and clamped integer, or zero when the value is not numeric.
 */
function toBoundedInteger(value: unknown, maximum: number): number {
  return Number.isFinite(Number(value))
    ? Math.min(maximum, Math.max(0, Math.round(Number(value))))
    : 0;
}

/**
 * Coerces an untrusted provider value to trimmed, length-bounded text.
 *
 * @param value - Raw provider value.
 * @param maximum - Maximum returned character count.
 * @returns Bounded text, or an empty string for non-string input.
 */
function toBoundedString(value: unknown, maximum: number): string {
  return (typeof value === "string" ? value.trim() : "").slice(0, maximum);
}

/**
 * Converts provider decimal major units to the selected currency's integer minor units.
 * Legacy *_cents outputs use fixed hundredths, never currency-specific minor units.
 * @param record Untrusted provider object.
 * @param field Decimal major-unit field in the extraction schema.
 * @param legacy Legacy fixed-hundredth value, for older compatible providers.
 * @param currency Currency governing the decimal scale.
 * @returns Bounded non-negative minor units; malformed values are zero.
 */
function providerMoney(record: Record<string, unknown>, field: string, legacy: unknown, currency: string): number {
  const digits = minorUnitDigits(currency);
  if (record[field] === undefined) {
    const hundredths = Number(legacy);
    return Number.isFinite(hundredths)
      ? toBoundedInteger(hundredths * (10 ** digits / 100), MAX_PARSED_MONEY_CENTS)
      : 0;
  }
  const value = String(record[field]).trim();
  if (!/^\d+(?:\.\d+)?$/.test(value) || value.length > 32) return 0;
  const [whole, fraction = ""] = value.split(".");
  // Integer arithmetic avoids losing a dinar's third decimal or multiplying yen by 100.
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt((fraction + "0".repeat(digits)).slice(0, digits) || "0");
  const rounded = minor + (Number(fraction[digits] ?? "0") >= 5 ? 1n : 0n);
  return Number(rounded > BigInt(MAX_PARSED_MONEY_CENTS) ? BigInt(MAX_PARSED_MONEY_CENTS) : rounded);
}

/**
 * Normalizes one model-produced line item.
 *
 * @param rawItem - Untrusted item value.
 * @param currency - Currency governing minor-unit conversion.
 * @returns A bounded line item with missing price fields derived when possible.
 */
function normalizeProviderItem(rawItem: unknown, currency: string): ParsedReceiptItem {
  const itemRecord = (typeof rawItem === "object" && rawItem !== null ? rawItem : {}) as Record<
    string,
    unknown
  >;
  const quantity = Math.max(
    1,
    toBoundedInteger(itemRecord.quantity ?? itemRecord.qty ?? 1, MAX_PARSED_QUANTITY),
  );
  const unitPrice = providerMoney(itemRecord, "unit_price", itemRecord.unit_price_cents ?? itemRecord.unitPriceCents, currency);
  let lineTotal = providerMoney(itemRecord, "total", itemRecord.total_cents ?? itemRecord.totalCents, currency);
  if (lineTotal === 0 && unitPrice > 0) {
    lineTotal = Math.min(MAX_PARSED_MONEY_CENTS, unitPrice * quantity);
  }
  return {
    name: toBoundedString(itemRecord.name, MAX_PARSED_NAME_LENGTH) || "Item",
    quantity,
    unitPriceCents: unitPrice > 0 ? unitPrice : Math.round(lineTotal / quantity),
    totalCents: lineTotal,
  };
}

/**
 * Accepts loosely-shaped provider output and normalizes it as untrusted data:
 * bounds arrays, strings, quantities and cents; clamps negatives; and derives
 * missing unit prices, subtotals and totals from what is present.
 *
 * @param rawOutput - Whatever JSON the provider produced (snake_case or camelCase keys).
 * @param fallbackCurrency - Form currency used when no supported receipt currency was detected.
 * @returns Fully populated, size-bounded receipt data.
 */
export function normalizeProviderOutput(rawOutput: unknown, fallbackCurrency = "USD"): ParsedReceiptData {
  const rawRecord = (typeof rawOutput === "object" && rawOutput !== null
    ? rawOutput
    : {}) as Record<string, unknown>;

  const reportedCurrency = toBoundedString(rawRecord.currency, 16).toUpperCase();
  const currency = currencyInfo(reportedCurrency)?.code ?? currencyInfo(fallbackCurrency)?.code ?? "USD";
  const items = (Array.isArray(rawRecord.items) ? rawRecord.items : [])
    .slice(0, MAX_PARSED_ITEMS)
    .map((item) => normalizeProviderItem(item, currency))
    // Keep zero-priced rows as long as they are named. A model that splits
    // "Toasted Bagel / with cream cheese $7.00" across two lines puts the price
    // on the modifier, so dropping the zero row would delete the actual item
    // and leave an orphaned "with cream cheese" behind. A visible $0.00 row is
    // something the reviewer can fix; a silently missing item is not.
    .filter((parsedItem) => parsedItem.totalCents > 0 || parsedItem.name !== "Item");

  const itemsTotal = items.reduce((runningTotal, parsedItem) => runningTotal + parsedItem.totalCents, 0);
  const taxCents = providerMoney(rawRecord, "tax", rawRecord.tax_cents ?? rawRecord.taxCents, currency);
  const tipCents = providerMoney(rawRecord, "tip", rawRecord.tip_cents ?? rawRecord.tipCents, currency);
  let subtotal = providerMoney(rawRecord, "subtotal", rawRecord.subtotal_cents ?? rawRecord.subtotalCents, currency);
  if (subtotal === 0) subtotal = Math.min(MAX_PARSED_MONEY_CENTS, itemsTotal);
  let total = providerMoney(rawRecord, "total", rawRecord.total_cents ?? rawRecord.totalCents, currency);
  if (total === 0) {
    total = Math.min(MAX_PARSED_MONEY_CENTS, subtotal + taxCents + tipCents);
  }

  return {
    merchant: toBoundedString(rawRecord.merchant, MAX_PARSED_NAME_LENGTH),
    date: toIsoDate(toBoundedString(rawRecord.date, MAX_PARSED_NAME_LENGTH)),
    currency,
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
 * Reads a fetch response while enforcing a byte cap during streaming. The
 * Content-Length check rejects obvious oversize responses immediately; the
 * running count remains authoritative for missing or dishonest headers.
 *
 * @param response - Provider response to consume.
 * @returns UTF-8 response text within the configured limit.
 * @throws Error when the response exceeds the byte ceiling.
 */
export async function readProviderResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    // Cancelled, not just abandoned: a body neither read nor cancelled keeps
    // its connection until garbage collection gets to it. A
    // cancel that fails changes nothing for the caller, who is told the size.
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`provider response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Error(`provider response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`provider response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes).toString("utf8");
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
  async parse(imageBase64, currency, signal) {
    const response = await fetch(`${COMPATIBLE_AI.baseUrl}/chat/completions`, {
      method: "POST",
      // The scan's own signal hangs up when the person leaves, so the lane
      // frees at once. The provider may still finish and bill a request it
      // has started (OpenRouter does for unstreamed ones); hanging up only
      // stops this server waiting for it.
      signal: AbortSignal.any([signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)]),
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
              { type: "image_url", image_url: { url: `data:${RECEIPT_IMAGE_MEDIA_TYPE};base64,${imageBase64}` } },
              { type: "text", text: `${PROMPT}\nRespond with ONLY the JSON object.` },
            ],
          },
        ],
      }),
    });
    const responseText = await readProviderResponse(response);
    if (!response.ok) {
      // The body goes to the log, not the client: a ZDR-enforced request to
      // a model with no zero-retention endpoint fails here, and "returned
      // 404" alone would send an operator hunting for a networking problem
      // that doesn't exist — but the provider's diagnostics are the
      // operator's to read, not the user's.
      logEvent("warn", "compatible receipt provider rejected the request", {
        providerStatus: response.status,
      });
      throw new Error(`compatible provider returned ${response.status}`);
    }
    const data = safeJsonParse(responseText, "compatible provider response") as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJsonObject(text);
    return normalizeProviderOutput(safeJsonParse(jsonText, "compatible"), currency);
  },
};

/** Deterministic sample so the scan flow is demoable without any API keys. */
const mockProvider: Provider = {
  name: "mock",
  available: () => true,
  async parse(_imageBase64, currency) {
    return normalizeProviderOutput({
      merchant: "Demo Diner",
      date: new Date().toISOString().slice(0, 10),
      currency: "",
      items: [
        { name: "Margherita pizza", quantity: 1, unit_price_cents: 1450, total_cents: 1450 },
        { name: "Chicken burger", quantity: 2, unit_price_cents: 995, total_cents: 1990 },
        { name: "Fries (large)", quantity: 1, unit_price_cents: 450, total_cents: 450 },
        { name: "Lemonade", quantity: 3, unit_price_cents: 300, total_cents: 900 },
      ],
      tax_cents: 419,
      tip_cents: 800,
    }, currency);
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
  const configured: Provider[] = [];
  const unconfigured: string[] = [];
  for (const provider of real) {
    if (provider.available()) configured.push(provider);
    else unconfigured.push(provider.name);
  }
  if (configured.length > 0) return { chain: configured, unconfigured };
  const wantsMock = requested.some((provider) => provider.name === mockProvider.name);
  return { chain: wantsMock ? [mockProvider] : [], unconfigured };
}

/** A receipt request that passed every check and is ready for the providers. */
interface PreparedReceipt {
  /** The providers to ask, in order. */
  chain: Provider[];
  /** The photo as the providers will see it: the upload without its metadata. */
  normalizedImage: Buffer;
  /** Selected expense currency, upper case. */
  currency: string;
}

/**
 * Checks a receipt request before any provider is asked: the currency, the
 * bytes, that the photo was prepared to the standard on the device, and that
 * some provider is configured.
 *
 * The photo is checked from its own bytes; the request's `media_type` field
 * is ignored. It is never decoded here: both apps convert, rotate and shrink
 * it before upload, and anything else is refused.
 *
 * @param image - Raw image bytes uploaded by the client.
 * @param currency - Selected expense currency, used when the image is ambiguous.
 * @returns What the providers need.
 * @throws UsecaseError "invalid_argument" when the currency is unsupported,
 *   the image is empty, too large or not a prepared photo, or when no
 *   provider is configured.
 */
function prepareReceipt(image: Uint8Array, currency: string): PreparedReceipt {
  currency = currency.trim().toUpperCase() || "USD";
  if (!currencyInfo(currency)) invalid("unsupported receipt currency");
  if (image.length === 0) invalid("no image provided");
  if (image.length > MAX_RECEIPT_IMAGE_BYTES) invalid("image is too large (max 8 MB)");
  const photo = acceptPreparedJpeg(image);

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

  return { chain, normalizedImage: Buffer.from(photo.buffer, photo.byteOffset, photo.length), currency };
}

/**
 * Asks each configured provider in order until one returns at least one
 * line item.
 *
 * A stopped scan asks no further provider: its reason is thrown as soon as
 * the signal aborts, before or during a provider's call.
 *
 * @param prepared - A request that passed {@link prepareReceipt}.
 * @param signal - Aborts when the scan stops.
 * @returns The normalized receipt, the name of the provider that produced it,
 *   and the JPEG that provider was shown.
 * @throws UsecaseError "invalid_argument" when a provider read the photo and
 *   found no line items. UsecaseError "unavailable" when no provider produced
 *   an answer at all (HTTP error, timeout, malformed response). The stop
 *   reason when the scan stopped.
 */
async function readReceipt(
  prepared: PreparedReceipt,
  signal: AbortSignal,
): Promise<{ receipt: ParsedReceiptData; provider: string; normalizedImage: Uint8Array }> {
  const { chain, normalizedImage, currency } = prepared;
  const imageBase64 = normalizedImage.toString("base64");
  const errors: string[] = [];
  // Set when a model answered and found nothing: then the photo is the
  // problem. Otherwise no provider produced an answer at all, and asking for
  // a clearer photo would blame the user for an outage.
  let readButEmpty = false;
  for (const provider of chain) {
    if (signal.aborted) throw scanStoppedError(signal);
    try {
      const receipt = await provider.parse(imageBase64, currency, signal);
      if (receipt.items.length === 0) {
        readButEmpty = true;
        errors.push(`${provider.name}: no line items detected`);
        continue;
      }
      return { receipt, provider: provider.name, normalizedImage };
    } catch (error) {
      if (signal.aborted) throw scanStoppedError(signal);
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Which provider failed how is operator information (it names models,
  // endpoints and policies), so it is logged under the same warning stream
  // the provider errors use, and the user gets a stable sentence.
  logEvent("warn", "no receipt provider could parse the image", { errors });
  if (readButEmpty) invalid("could not read the receipt. Try a clearer photo of the whole bill");
  unavailable("receipt scanning is unavailable right now. Please try again in a few minutes");
}

/**
 * Counts one scan attempt. A failure to count is logged and swallowed: the
 * tally is bookkeeping, and a person's scan must not fail (or a failed scan
 * report a different error) because the counter could not be written. For
 * the same reason the scan does not wait for it: the caller starts it and
 * answers the person, so a slow insert neither delays the receipt nor holds
 * a parse slot. It never rejects, so nothing is left unhandled.
 *
 * @param userId - The person who uploaded the image.
 * @param outcome - Whether a provider returned line items.
 */
async function recordScan(userId: string, outcome: ReceiptScanOutcome): Promise<void> {
  try {
    await insertReceiptScan(userId, outcome);
  } catch (error) {
    logError(error, { scope: "receipt-scan-count" });
  }
}

/**
 * Parses a receipt for a signed-in person and counts the attempt: checks
 * the request, then tries each configured provider in order until one
 * returns at least one line item. The only way into parsing, so no scan
 * goes uncounted.
 *
 * The count is the whole record of a scan (see the receipt_scans migration):
 * who, when, and whether it worked. The image and everything read off it
 * still leave no trace.
 *
 * An attempt is a photo put to a provider. A request refused before that
 * (an empty or oversized file, one that is not an image or will not decode,
 * an unsupported currency, a server with no provider configured) is
 * answered with its reason and not counted: it says nothing about how often
 * scanning works, and counting it would read as an outage on the admin
 * page. For the same reason, call this only once the person has allowed
 * scanning, and a scan that stopped because the person left or started
 * another is not counted either.
 *
 * @param userId - The authenticated person who uploaded the image.
 * @param image - Raw image bytes uploaded by the client.
 * @param currency - Expense currency for receipts that do not print one.
 * @param signal - Aborts when the scan stops (its lane's signal); never, by default.
 * @returns The normalized receipt, the name of the provider that produced it,
 *   and the JPEG that provider was shown, for the client to display alongside
 *   the extracted values.
 * @throws Whatever {@link prepareReceipt} or {@link readReceipt} throws; a
 *   provider's failure is counted too.
 */
export async function scanReceipt(
  userId: string,
  image: Uint8Array,
  currency = "USD",
  signal: AbortSignal = new AbortController().signal,
): Promise<{ receipt: ParsedReceiptData; provider: string; normalizedImage: Uint8Array }> {
  const prepared = prepareReceipt(image, currency);
  try {
    const parsed = await readReceipt(prepared, signal);
    void recordScan(userId, "parsed");
    return parsed;
  } catch (error) {
    if (!signal.aborted) void recordScan(userId, "failed");
    throw error;
  }
}
