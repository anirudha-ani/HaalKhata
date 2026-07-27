"use client";
/** Receipt input for the expense form: dropzone, parse button, and the photo to check against. */

/* eslint-disable @next/next/no-img-element */

import { FileImage, ScanLine, Upload } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the receipt half of the expense form: a dropzone that becomes a
 * preview, the "Itemize with AI" action, and — once parsed — the photo the
 * numbers were read from.
 *
 * This is an input to the expense form, not a separate flow. Scanning does
 * not produce a different kind of expense: it fills in the description, date,
 * tax, tip and line items of the very same form, which is why there is no
 * longer a /scan route holding a second copy of the item grid and the payer
 * editor.
 *
 * @param props - Component props.
 * @returns The receipt panel.
 */
export function ReceiptPanel({
  form,
}: {
  /** The expense-form controller from useNewExpense that owns the receipt state. */
  form: NewExpenseController;
}) {
  // The server's normalized JPEG once parsed (the only renderable form of an
  // iPhone HEIC, and exactly what the model read); the local file before that.
  const shownImage = form.receiptUrl || (form.isPreviewRenderable ? form.previewUrl : "");
  const hasReceipt = form.receiptUrl !== "";

  return (
    <section className="space-y-3">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
          form.previewUrl ? "border-line bg-card py-4" : "border-brand-200 bg-brand-50/50 py-8"
        }`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) form.pickFile(picked);
          }}
        />
        {shownImage ? (
          <img
            src={shownImage}
            alt="Receipt"
            className={`w-full rounded-xl object-contain ${
              hasReceipt ? "max-h-[70vh]" : "max-h-72"
            }`}
          />
        ) : form.previewUrl ? (
          // Chrome and Firefox cannot decode HEIC, so an <img> here renders as
          // a broken-image icon. The server transcodes it fine and sends the
          // JPEG back once parsed — confirm the pick in words until then.
          <div className="flex flex-col items-center gap-1 py-4">
            <FileImage className="h-8 w-8 text-brand-600" />
            <p className="font-semibold">{form.fileName}</p>
            <p className="text-sm text-ink-soft">HEIC photo ready — shown once itemized</p>
          </div>
        ) : (
          <>
            <Upload className="h-7 w-7 text-brand-600" />
            <div>
              <p className="font-semibold">Scan a receipt</p>
              <p className="text-sm text-ink-soft">
                Items, tax and tip fill themselves in · JPEG, PNG, WebP or iPhone HEIC
              </p>
            </div>
          </>
        )}
        <span className="text-xs font-medium text-brand-600">
          {form.previewUrl ? "Choose a different photo" : ""}
        </span>
      </label>

      {form.file && !hasReceipt ? (
        <button
          type="button"
          onClick={form.parseNow}
          disabled={form.isParsing}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <ScanLine className="h-5 w-5" />
          {form.isParsing ? "Reading the receipt…" : "Itemize with AI"}
        </button>
      ) : null}

      {form.isParsing ? <Spinner label="Extracting items, tax and tip…" /> : null}

      {hasReceipt ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-pos-50 px-3 py-1 text-xs font-semibold text-pos-700">
            ✓ auto-itemized{form.provider ? ` · ${form.provider}` : ""}
          </span>
          {form.provider === "mock" ? (
            <span className="rounded-full bg-neg-50 px-3 py-1 text-xs font-semibold text-neg-700">
              demo data — no AI provider configured
            </span>
          ) : null}
          <span className="text-xs text-ink-soft">check it against the photo before saving</span>
        </div>
      ) : null}
    </section>
  );
}
