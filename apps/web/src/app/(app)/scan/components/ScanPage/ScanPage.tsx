"use client";
/** Scan route orchestrator: pick who it's with, upload a receipt, itemize with AI, check side by side, save. */

/* eslint-disable @next/next/no-img-element */

import { FileImage, ScanLine, Upload } from "lucide-react";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { Spinner } from "@/components/ui/Spinner";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { DraftEditor } from "./components/DraftEditor/DraftEditor";
import { useScan } from "./hooks/useScan";

/**
 * Renders the receipt-scanning page. Before a scan it is a single column: who
 * the receipt is with, then the upload zone. Once parsed it becomes two
 * columns on a wide screen — the photo on the left, sticky so it stays put
 * while you work down the item grid on the right, which is the whole point of
 * showing it: checking the extracted numbers against the paper.
 *
 * @returns The scan page content, or a spinner while picker data loads.
 */
export function ScanPage({
  initialGroupId,
  initialFriendId = "",
}: {
  /** Group id from the ?group search param to preselect (empty string for none). */
  initialGroupId: string;
  /** Friend id from the ?friend search param to start the cast with ("" for none). */
  initialFriendId?: string;
}) {
  const scan = useScan(initialGroupId, initialFriendId);
  const hydrated = useHydrated();

  if (!hydrated || scan.isLoading) return <Spinner />;

  const hasDraft = scan.items !== null;
  // The server's normalized JPEG once parsed (the only renderable form of an
  // iPhone HEIC, and exactly what the model read); the local file before that.
  const shownImage = scan.receiptUrl || (scan.isPreviewRenderable ? scan.previewUrl : "");

  const uploadZone = (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
        scan.previewUrl ? "border-line bg-card py-4" : "border-brand-200 bg-brand-50/50 py-12"
      }`}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) scan.pickFile(picked);
        }}
      />
      {shownImage ? (
        <img
          src={shownImage}
          alt="Receipt"
          className={`w-full rounded-xl object-contain ${hasDraft ? "max-h-[70vh]" : "max-h-72"}`}
        />
      ) : scan.previewUrl ? (
        // Chrome and Firefox cannot decode HEIC, so an <img> here renders as a
        // broken-image icon. The server transcodes it fine and sends the JPEG
        // back once parsed — confirm the pick in words until then.
        <div className="flex flex-col items-center gap-1 py-4">
          <FileImage className="h-8 w-8 text-brand-600" />
          <p className="font-semibold">{scan.fileName}</p>
          <p className="text-sm text-ink-soft">HEIC photo ready — shown once itemized</p>
        </div>
      ) : (
        <>
          <Upload className="h-8 w-8 text-brand-600" />
          <div>
            <p className="font-semibold">Take a photo or upload</p>
            <p className="text-sm text-ink-soft">JPEG, PNG, WebP or iPhone HEIC · up to 8 MB</p>
          </div>
        </>
      )}
      <span className="text-xs font-medium text-brand-600">
        {scan.previewUrl ? "Choose a different photo" : ""}
      </span>
    </label>
  );

  return (
    <div className={`mx-auto space-y-6 ${hasDraft ? "max-w-6xl" : "max-w-2xl"}`}>
      <header>
        <h1 className="text-3xl font-bold">Scan a receipt</h1>
        <p className="mt-1 text-ink-soft">
          Snap a photo — items, tax and tip are extracted automatically, then you tick who had
          what.
        </p>
      </header>

      <PeoplePicker
        me={scan.me}
        people={scan.people}
        friends={scan.friends.flatMap((friendship) => (friendship.user ? [friendship.user] : []))}
        groups={scan.groups.flatMap((summary) => (summary.group ? [summary.group] : []))}
        groupId={scan.groupId}
        friendIds={scan.friendIds}
        onGroupChange={scan.setGroupId}
        onToggleFriend={scan.toggleFriend}
      />

      <div className={hasDraft ? "grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : ""}>
        {/* Sticky so the receipt stays beside the grid all the way down. */}
        <div className={hasDraft ? "lg:sticky lg:top-6 lg:self-start" : ""}>{uploadZone}</div>

        <div className="space-y-6">
          {scan.file && !hasDraft ? (
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

          {hasDraft ? (
            <>
              {!scan.hasParticipants ? (
                <p className="text-sm font-medium text-neg-600">
                  add the people this receipt is with, above
                </p>
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
      </div>
    </div>
  );
}
