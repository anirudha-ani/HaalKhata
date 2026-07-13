"use client";
/** Scan route orchestrator: pick who it's with, upload a receipt photo, itemize with AI, save. */

/* eslint-disable @next/next/no-img-element */

import { ScanLine, Upload } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { DraftEditor } from "./components/DraftEditor/DraftEditor";
import { useScan } from "./hooks/useScan";

/**
 * Renders the receipt-scanning page: the group/friend picker, the photo
 * upload/capture zone with preview, the "Itemize with AI" action, the
 * DraftEditor for the parsed result, and the save button with validation
 * hints.
 *
 * @returns The scan page content, or a spinner while picker data loads.
 */
export function ScanPage({
  initialGroupId,
}: {
  /** Group id from the ?group search param to preselect (empty string for none). */
  initialGroupId: string;
}) {
  const scan = useScan(initialGroupId);

  if (scan.isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Scan a receipt</h1>
        <p className="mt-1 text-ink-soft">
          Snap a photo — items, tax and tip are extracted automatically, then
          you assign who had what.
        </p>
      </header>

      <select
        value={scan.context}
        onChange={(event) => scan.setContext(event.target.value)}
        className="w-full rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none"
      >
        <option value="" disabled>
          Who is this with?
        </option>
        {scan.groups.length > 0 ? (
          <optgroup label="Groups">
            {scan.groups.map((summary) =>
              summary.group ? (
                <option key={summary.group.id} value={`g:${summary.group.id}`}>
                  {summary.group.name}
                </option>
              ) : null,
            )}
          </optgroup>
        ) : null}
        {scan.friends.length > 0 ? (
          <optgroup label="Friends (one-off)">
            {scan.friends.map((friend) =>
              friend.user ? (
                <option key={friend.user.id} value={`f:${friend.user.id}`}>
                  {friend.user.name}
                </option>
              ) : null,
            )}
          </optgroup>
        ) : null}
      </select>

      {/* Upload zone */}
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
          scan.previewUrl ? "border-line bg-card py-4" : "border-brand-200 bg-brand-50/50 py-12"
        }`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) scan.pickFile(picked);
          }}
        />
        {scan.previewUrl ? (
          <img
            src={scan.previewUrl}
            alt="Receipt preview"
            className="max-h-72 rounded-xl object-contain"
          />
        ) : (
          <>
            <Upload className="h-8 w-8 text-brand-600" />
            <div>
              <p className="font-semibold">Take a photo or upload</p>
              <p className="text-sm text-ink-soft">JPEG, PNG or WebP · up to 8 MB</p>
            </div>
          </>
        )}
      </label>

      {scan.file && scan.items === null ? (
        <button
          type="button"
          onClick={scan.parseNow}
          disabled={scan.isParsing}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <ScanLine className="h-5 w-5" />
          {scan.isParsing ? "Reading the receipt…" : "Itemize with AI"}
        </button>
      ) : null}

      {scan.isParsing ? <Spinner label="Extracting items, tax and tip…" /> : null}

      <DraftEditor scan={scan} />

      {scan.error ? <p className="text-sm font-medium text-brand-600">{scan.error}</p> : null}

      {scan.items !== null ? (
        <>
          {scan.unassignedCount > 0 ? (
            <p className="text-sm font-medium text-neg-600">
              {scan.unassignedCount} item{scan.unassignedCount === 1 ? " is" : "s are"} unassigned
            </p>
          ) : null}
          {scan.context === "" ? (
            <p className="text-sm font-medium text-neg-600">choose a group or friend above</p>
          ) : null}
          <button
            type="button"
            onClick={scan.save}
            disabled={!scan.canSave || scan.isSaving}
            className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {scan.isSaving ? "Saving…" : "Save itemized expense"}
          </button>
        </>
      ) : null}
    </div>
  );
}
