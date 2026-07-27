"use client";
/** Receipt input for the expense form: camera/library pickers, parse action, and the photo to check against. */

/* eslint-disable @next/next/no-img-element */

import { Camera, FileImage, ImageUp, Loader2, ScanLine } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { ACCEPTED_IMAGE_INPUT } from "./receiptPanel.constants";
import type { NewExpenseController } from "../../hooks/useNewExpense";

/**
 * Renders the receipt half of the expense form: the pickers, the "Itemize
 * with AI" action, and — once parsed — the photo the numbers were read from.
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
  // On a phone the photo sits above the grid rather than beside it, so a
  // full-height image would push every item off screen. It starts compact and
  // opens on tap; on desktop, where it has its own column, it is always full.
  const [expanded, setExpanded] = useState(false);

  /**
   * Hands a chosen file to the form. Resets the input's value first so
   * choosing the same photo twice still fires a change event.
   *
   * @param event - The file input's change event.
   */
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (picked) void form.pickFile(picked);
  };

  return (
    <section className="space-y-3">
      {shownImage ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Shrink receipt photo" : "Expand receipt photo"}
          className="block w-full overflow-hidden rounded-2xl border border-line bg-card"
        >
          <img
            src={shownImage}
            alt="Receipt"
            className={`w-full object-contain transition-[max-height] duration-200 ${
              expanded ? "max-h-[80vh]" : "max-h-52"
            } lg:max-h-[70vh]`}
          />
        </button>
      ) : null}

      {/* HEIC cannot be painted by Chrome or Firefox, so an <img> would render
          a broken icon for a file that is perfectly fine. Say so in words
          until the server sends the transcoded JPEG back. */}
      {!shownImage && form.previewUrl ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-card py-5">
          <FileImage className="h-8 w-8 text-brand-600" />
          <p className="px-4 text-center text-sm font-semibold break-all">{form.fileName}</p>
          <p className="text-xs text-ink-soft">iPhone photo ready — shown once itemized</p>
        </div>
      ) : null}

      {form.isPreparing ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-card py-3 text-sm text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Getting the photo ready…
        </p>
      ) : null}

      {/* Two pickers, not one. A single input with `capture` opens the camera
          and gives no way to reach an existing photo — which breaks the
          common case of shooting the receipt at the table and splitting it
          later. `capture` is ignored on desktop, so Take photo is phone-only
          and Choose photo covers everything. */}
      {!hasReceipt ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
          <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:border-brand-300 sm:hidden">
            <input
              type="file"
              accept={ACCEPTED_IMAGE_INPUT}
              capture="environment"
              className="hidden"
              onChange={choose}
            />
            <Camera className="h-5 w-5 text-brand-600" />
            Take photo
          </label>

          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${
              form.previewUrl
                ? "min-h-12 border-line bg-card px-4 py-3"
                : "border-brand-200 bg-brand-50/50 px-4 py-4 sm:py-8"
            }`}
          >
            <input
              type="file"
              accept={ACCEPTED_IMAGE_INPUT}
              className="hidden"
              onChange={choose}
            />
            {form.previewUrl ? (
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-600">
                <ImageUp className="h-4 w-4" /> Choose a different photo
              </span>
            ) : (
              <>
                <ImageUp className="h-6 w-6 text-brand-600" />
                <span>
                  <span className="block text-sm font-semibold">Scan a receipt</span>
                  <span className="block text-xs text-ink-soft">
                    Items, tax and tip fill themselves in
                  </span>
                </span>
              </>
            )}
          </label>
        </div>
      ) : null}

      {form.file && !hasReceipt && !form.isPreparing ? (
        <button
          type="button"
          onClick={form.parseNow}
          disabled={form.isParsing}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
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
          <span className="text-xs text-ink-soft">tap the photo to enlarge · check before saving</span>
        </div>
      ) : null}
    </section>
  );
}
