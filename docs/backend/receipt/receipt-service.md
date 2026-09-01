# Receipt Service (`receipt.v1.ReceiptService`)

AI receipt itemization: an uploaded photo becomes a normalized draft that the
user reviews before it becomes an itemized expense. **AI output is never
auto-committed** — the review step is the product, not a formality.

The Receipt Service is essential for:

- **Itemized splits without typing:** merchant, date, line items, tax, tip,
  and totals extracted from a photo.
- **Privacy containment:** the image is never persisted — it lives in memory
  for one request; only the structured draft the user approves is ever
  saved (as an ordinary `CreateExpense`).

Implementation: [handler.ts](../../../apps/web/src/server/receipt/handler.ts)
→ [receipt.usecase.ts](../../../apps/web/src/server/receipt/usecase/receipt.usecase.ts),
configuration in
[receipt.constants.ts](../../../apps/web/src/server/receipt/receipt.constants.ts).

---

## Provider Architecture

There is deliberately **no provider-specific SDK**. One provider shape,
`compatible`, speaks the OpenAI `/chat/completions` wire format; in
production it points at OpenRouter, which fronts every model worth using
(Claude and Gemini included) behind one key. Swapping the model is a change
to `COMPATIBLE_AI_MODEL`, not code.

- `RECEIPT_AI_PROVIDERS` (default `compatible,mock`) orders the chain.
- **The mock is not a fallback.** It is used only when *no* real provider is
  configured, so an unconfigured dev box can demo the flow — and its use is
  logged loudly, because "Demo Diner" looks like a successful scan of the
  wrong receipt. A real provider that is misconfigured or failing surfaces
  as a failure, never as mock data.
- Structured output is requested via `json_schema` (strict) so the model is
  constrained to the shape, not just "some JSON"; models without
  `json_schema` support fail visibly with the provider's error in the log.
- `COMPATIBLE_AI_ZDR=true` adds OpenRouter's `zdr: true` (routes only to
  zero-data-retention endpoints). Opt-in because a stricter
  OpenAI-compatible server could reject the unknown key; account-wide ZDR in
  OpenRouter is recommended *as well* — that fails closed if a request ever
  omits the flag.
- Provider hardening: 90 s timeout, responses read with a streaming **1 MiB
  byte cap** (Content-Length is checked but the running count stays
  authoritative against dishonest headers), JSON extracted by
  balanced-brace scanning (models wrap output in fences/prose), and clear
  named errors per provider for the failover log.

## Image Pipeline

1. **Size gates:** non-empty, ≤ 8 MB compressed, ≤ 40 MP decoded (checked
   *without* multiplying attacker-controlled dimensions first — width is
   bounded by `MAX_PIXELS / height`).
2. **Format detection from magic bytes** — the client's `media_type` is
   advisory and ignored. Browsers report an empty string for HEIC, so a
   perfectly valid iPhone photo arrives unlabeled; sniffing is both more
   permissive (accepts what the browser could not name) and stricter (a
   `.png` full of script is recognized for what it is). Accepted: JPEG, PNG,
   WebP, GIF, HEIC/HEIF (still-image brands only — HEIF containers also
   hold video, and only stills are worth transcoding).
3. **HEIC decode** via `heic-decode`, *not* sharp: sharp's bundled libheif
   caps `iref` boxes at 16 references and real iPhone photos carry ~48 (HDR
   gain map, depth map, thumbnails), so every one of them would fail.
   Metadata is read **before** pixel decode (the decoder otherwise allocates
   width×height×4 before reporting dimensions), and decodes are limited to
   **one at a time per process** — the slot is held through Sharp's
   consumption of the raw RGBA buffer, so a second upload cannot allocate
   while the first is still compressing.
4. **Normalization to JPEG** (every format, not just HEIC): EXIF rotation is
   applied (providers read pixels; a sideways receipt would be transcribed
   sideways), the long edge is capped at 2576 px (larger is downsampled
   provider-side anyway), quality 88 (small receipt print must stay
   legible).
5. The resulting JPEG is what the provider sees **and** what the response
   returns (`normalized_image`) — browsers cannot render the original HEIC,
   and showing the user exactly what the model read is the honest preview.

## Untrusted-Output Normalization

Model output is handled as attacker-controllable data, whatever the schema
promised:

- Arrays, strings, quantities, and cents are bounded (≤ 100 items, names ≤
  200 chars, quantities ≤ 10,000, cents ≤ 2e9); negatives clamped; missing
  unit prices/subtotal/total derived from what is present.
- **Zero-priced rows are kept when named:** a model that splits "Toasted
  Bagel / with cream cheese $7.00" across two lines puts the price on the
  modifier — dropping the zero row would delete the actual item. A visible
  $0.00 row is something the reviewer can fix; a silently missing item is
  not.
- **Dates are coerced, never trusted:** models return things like
  `"1/17/26 11:41 AM"` despite instructions. `toIsoDate` accepts a real
  `YYYY-MM-DD`, an embedded ISO date, or a month-first numeric date (US-first
  product), and otherwise returns `""` — leaving today's date in the form
  beats failing the save.
- The prompt instructs the model to treat every word in the image as receipt
  data and never follow instructions printed in it (prompt-injection
  guard) — and nothing downstream executes model text either way.
- Currency defaults to `USD` when unreadable; uppercased 3-letter code.

## Resource Limits

| Guard | Value |
| --- | --- |
| Rate limit | 5/min per account |
| Concurrency | 2 parses per process (handler gate, `ResourceExhausted` when busy); 1 HEIC decode per process |
| Upload | 8 MB bytes, 40 MP pixels |
| Provider | 90 s timeout, 1 MiB response cap |

---

## Overview of Endpoints

1. [ParseReceipt](#1-parsereceipt)

---

### 1. ParseReceipt

**Method:** `ParseReceipt`
**Route:** `POST /api/connect/receipt.v1.ReceiptService/ParseReceipt`

#### Notes

- Providers are tried in configured order until one returns **at least one
  line item**; an itemless "success" counts as a failure and falls through.
  When every provider fails, the per-provider errors go to the operator log
  (they name models, endpoints, and policies) and the user gets one stable
  sentence: "could not read the receipt — try a clearer photo of the whole
  bill".
- No `operation_id`: parsing stores nothing, so a retry costs money but can
  never duplicate data.
- All user-facing failures are `InvalidArgument` with actionable wording
  (unsupported file, too large, unconfigured provider, unreadable image);
  decoder internals are logged, never shown.

#### Request

**ParseReceiptRequest:**

| Field | Type | Description |
| --- | --- | --- |
| image | bytes | The photo; ≤ 8 MB. |
| media_type | string | **Advisory only** — the real format is detected from the bytes (browsers report `""` for HEIC). |

#### Response

**ParseReceiptResponse:**

| Field | Type | Description |
| --- | --- | --- |
| receipt | ParsedReceipt | The normalized draft (below). |
| provider | string | Which backend produced it: `"compatible"` \| `"mock"`. |
| normalized_image | bytes | The exact JPEG the provider was shown (post-rotation/downscale/transcode), for side-by-side review. **Never stored server-side.** |

**ParsedReceipt:**

| Field | Type | Description |
| --- | --- | --- |
| merchant | string | ≤ 200 chars; may be empty. |
| date | string | `YYYY-MM-DD` or `""` when unreadable. |
| currency | string | ISO 4217 guess; defaults `"USD"`. |
| items | repeated ParsedReceiptItem | `{name, quantity, unit_price_cents, total_cents}`; ≤ 100 rows; modifiers folded into their items. |
| subtotal_cents | int32 | Derived from items when the receipt's own is unreadable. |
| tax_cents | int32 | All taxes combined; 0 when absent. |
| tip_cents | int32 | Tip/service charge; 0 when absent. |
| total_cents | int32 | Derived from subtotal+tax+tip when unreadable. |

**Sample Response (JSON):**

```json
{
  "receipt": {
    "merchant": "Demo Diner",
    "date": "2026-08-30",
    "currency": "USD",
    "items": [
      { "name": "Margherita pizza", "quantity": 1, "unitPriceCents": 1450, "totalCents": 1450 },
      { "name": "Lemonade", "quantity": 3, "unitPriceCents": 300, "totalCents": 900 }
    ],
    "subtotalCents": 2350,
    "taxCents": 205,
    "tipCents": 400,
    "totalCents": 2955
  },
  "provider": "compatible",
  "normalizedImage": "<JPEG bytes>"
}
```

The client feeds the reviewed draft into
[`CreateExpense`](../expense/expense-service.md#1-createexpense) with
`split_type: "itemized"` — where the server recomputes the splits and
requires items+tax+tip to equal the stated total, so even an approved-but-
wrong draft cannot create inconsistent money.
