"use client";
/** Dialog showing the caller's profile link as a QR code, with copy and OS-share actions. */

import { QRCodeSVG } from "qrcode.react";
import { Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { inviteUrl } from "@haalkhata/shared/invite/invite";
import { Modal } from "@/components/ui/Modal";
import { shareProfileInvite } from "@/lib/invite/share";

/** How long the copy button holds its confirmed state, in milliseconds. */
const COPIED_BADGE_MS = 1800;

/**
 * Renders the share-my-profile dialog: the link as a scannable QR code for
 * the person standing next to you, the URL itself readable and selectable,
 * a copy button, and the OS share sheet where the browser has one. Nothing
 * leaves the device until one of those is chosen; opening the dialog only
 * fetched the link.
 *
 * @param props - Component props.
 * @param props.token - The profile link's token, already minted.
 * @param props.name - The profile owner's display name, for the share message.
 * @param props.onClose - Called when the dialog is dismissed.
 * @returns The dialog.
 */
export function ProfileShareModal({
  token,
  name,
  onClose,
}: {
  token: string;
  name: string;
  onClose: () => void;
}) {
  const linkUrl = inviteUrl(token);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");
  // The share sheet exists on phones and mostly not on desktops; the copy
  // button is the constant, so a missing sheet hides its button rather than
  // showing one that cannot work.
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_BADGE_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    setShareError("");
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
    } catch {
      setShareError("Couldn't reach the clipboard. Select the link and copy it instead.");
    }
  };

  const openShareSheet = async () => {
    setShareError("");
    try {
      await shareProfileInvite(token, name);
    } catch (error) {
      // Closing the sheet is a decision, not a failure.
      if (error instanceof Error && error.name === "AbortError") return;
      setShareError("The share sheet didn't open. Copy the link instead.");
    }
  };

  return (
    <Modal title="Share my profile" onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-sm text-ink-soft">
          Anyone who scans this or opens the link can send you a friend request.
        </p>
        {/* White behind the code on purpose: scanners want contrast, and the
            card background follows the theme. */}
        <div className="rounded-xl border border-line bg-white p-3">
          <QRCodeSVG value={linkUrl} size={192} marginSize={1} aria-label="Profile link QR code" />
        </div>
        <code className="w-full select-all break-all rounded-lg bg-paper px-3 py-2 text-center text-xs text-ink-soft">
          {linkUrl}
        </code>
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-500"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          {canNativeShare ? (
            <button
              type="button"
              onClick={openShareSheet}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-2.5 font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600"
            >
              <Share2 className="h-4 w-4" />
              Share…
            </button>
          ) : null}
        </div>
        {shareError ? <p className="text-sm font-medium text-brand-700">{shareError}</p> : null}
      </div>
    </Modal>
  );
}
