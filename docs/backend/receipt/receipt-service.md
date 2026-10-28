# Receipt Service (`receipt.v1.ReceiptService`)

AI receipt itemization: an uploaded photo becomes a normalized draft that the
user reviews before it becomes an itemized expense. **AI output is never
auto-committed** — the review step is the product, not a formality.

The Receipt Service is essential for:

- **Itemized splits without typing:** merchant, date, line items, tax, tip,
  and totals extracted from a photo.
- **Privacy containment:** the image is never persisted — it lives in memory
  for one request; only the structured draft the user approves is ever
  saved (as an ordinary `CreateExpense`). Third-party processing requires
  saved account permission for the current sharing terms before provider calls.

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

The photo is prepared on the device and only checked on the server. The
standard lives in `@haalkhata/shared/receipt/receipt.constants`, read by
both apps and the server: a JPEG at most 2576 px on its longer side, with
its rotation applied to the pixels and no metadata, at most 8 MB.

**On the device.**

- **Web** (`apps/web/src/lib/image/receiptImage.ts`): every photo is
  re-encoded, even a small one, because that is what applies its rotation
  and leaves its metadata behind. The browser decodes it (`createImageBitmap`
  with `imageOrientation: "from-image"`) and a canvas draws it upright at
  upload size on white, then encodes a JPEG at quality 0.85. Chrome turns
  a JPEG upright even when asked not to and Safari before 16.4 never does,
  so the decoded size is compared with the size stored in the file
  (`remainingTurn`) and the EXIF turn is made only when the browser did not.
  A HEIC opens natively in Safari 17+; in Chrome, Firefox and Edge it is
  decoded by libheif (WebAssembly) in a Web Worker
  (`heicToJpeg.worker.ts`), loaded only when somebody picks a HEIC and
  stopped after the one photo. A 48 MP iPhone photo takes about three
  seconds on a laptop. A photo the browser cannot read is refused beside the
  control, before any upload.
- **Mobile** (`prepareReceiptPhoto.ts`): `expo-image-manipulator` decodes
  natively (HEIC included), shrinks to the standard and saves a JPEG. The
  render is measured again and shrunk a second time if the picker reported
  the size before rotation.

**On the server** (`usecase/image/preparedJpeg.ts`). No image is decoded:

1. **Size gates:** non-empty and ≤ 8 MB.
2. **The standard, from the headers alone:** the bytes must be one whole
   JPEG (start and end markers, segments that add up, exactly one frame
   header before the first scan), at most 2576 px on each side. Anything
   else, such as a HEIC, a PNG or a full-size camera JPEG sent straight to
   the API, is refused as "not prepared for upload". The walk stops at the
   first scan, so its cost does not depend on what the photo shows.
3. **Metadata removed:** APP1 (EXIF, XMP), the other application segments
   and comments are dropped; APP0 (JFIF) and APP2 (the colour profile) are
   kept, and everything from the first scan on is forwarded byte for byte.
4. The resulting JPEG is what the provider sees **and** what the response
   returns (`normalized_image`), so the person sees exactly what the model
   read.

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
| Concurrency | 2 parses per process (handler gate, `ResourceExhausted` when busy) |
| Upload | A prepared JPEG: 8 MB, 2576 px on its longer side |
| Memory | No image is decoded on the server; a scan costs its request body |
| Provider | 90 s timeout, 1 MiB response cap |

---

## Overview of Endpoints

1. [ParseReceipt](#1-parsereceipt)
2. [GetProcessingInfo](#2-getprocessinginfo)
3. [GrantConsent / RevokeConsent](#3-grantconsent--revokeconsent)

---

### 1. ParseReceipt

**Method:** `ParseReceipt`
**Route:** `POST /api/connect/receipt.v1.ReceiptService/ParseReceipt`

#### Notes

- Missing, withdrawn or outdated account permission (or a stale `consent_version`)
  returns `FailedPrecondition` before image processing or a provider call. A client
  cannot authorize scanning just by copying the public version. Both apps check
  permission immediately before an upload; if needed, they ask once and save the
  choice with `GrantConsent`. New photos and new expenses reuse that permission.
- Providers are tried in configured order until one returns **at least one
  line item**; an itemless "success" counts as a failure and falls through.
  When every provider fails, the per-provider errors go to the operator log
  (they name models, endpoints, and policies) and the user gets one of two
  stable sentences, chosen by what happened:
  - A model answered and found no line items: `InvalidArgument` "could not
    read the receipt. Try a clearer photo of the whole bill". The photo is
    the problem.
  - No provider produced an answer at all (HTTP error, timeout, malformed
    response): `Unavailable` "receipt scanning is unavailable right now.
    Please try again in a few minutes". Asking for a clearer photo here
    would blame the user for an outage.
- No `operation_id`: parsing stores nothing about the receipt, so a retry
  costs money but can never duplicate data.
- **Each attempt is counted, and that is all.** `scanReceipt` wraps the parse
  and writes one `receipt_scans` row: who scanned, when, and whether a
  provider read the photo (`parsed` or `failed`). No image, merchant, amount
  or line item is kept. The count feeds the person's own insights and the
  operator's usage overview. A counter that cannot be written is logged and
  swallowed: it can never fail a scan or replace the scan's own error. The
  scan does not wait for the row either: the answer goes back as soon as
  the provider's does, and the insert finishes on its own.
  An attempt is a photo put to a provider: a request refused before that
  (empty, oversized, not an image or undecodable, an unsupported currency,
  no provider configured) gets its reason and no row, so a configuration
  gap or a client bug never reads as failed scans. `failed` therefore means
  a provider was asked and returned no line items or no answer.
- Every other user-facing failure is `InvalidArgument` with actionable
  wording (unsupported file, too large, unconfigured provider, unreadable
  image); decoder internals are logged, never shown.

#### Request

**ParseReceiptRequest:**

| Field | Type | Description |
| --- | --- | --- |
| image | bytes | The photo; ≤ 8 MB. |
| media_type | string | **Advisory only** — the real format is detected from the bytes (browsers report `""` for HEIC). |
| consent_version | string | Current sharing-terms version; the account must also have saved permission. |

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

### 2. GetProcessingInfo

`POST /api/connect/receipt.v1.ReceiptService/GetProcessingInfo` takes
`google.protobuf.Empty` and returns `{ disclosure, consent_version, consent_granted }`
for the signed-in account. Reading this information never uploads an image.

On the first explicit “Itemize with AI” action, clients show the named recipients,
purpose and account-wide scope, with **Allow AI scanning** / **Enter manually**.
Allow saves permission and continues the requested scan; decline/dismissal sends
no photo. Later scans check the server and proceed without another prompt. A failed
permission read or save never falls back to cached permission. Manual entry remains
available. Public legal links accompany the first-use prompt.

### 3. GrantConsent / RevokeConsent

`GrantConsent({ consent_version })` verifies the terms actually shown and upserts
`receipt_consents(user_id, consent_version, granted_at)` for the authenticated
account. It rejects stale terms with `FailedPrecondition`. `RevokeConsent({})`
deletes that account's permission. Both return updated `ReceiptProcessingInfo`.
Account → AI receipt scanning exposes withdrawal on web, phone and tablet.

The version covers recipient wording, gateway host, OpenRouter model provider,
provider chain and retention settings. Routine model-version upgrades with the
same recipients do not reset permission. The server reads saved permission for
every parse, so another device's cached allowance cannot bypass withdrawal.
Withdrawal stops subsequent processing; it cannot recall an already-sent request.
Account deletion cascades to the permission row. Existing accounts are not opted in
by migration, and old per-photo checkbox choices are not converted into permission.

Both apps prepare camera and library photos, HEIC included, to the standard
before upload (see Image Pipeline). The server checks that standard from the
photo's own headers, removes its metadata and sends exactly that JPEG to AI.
