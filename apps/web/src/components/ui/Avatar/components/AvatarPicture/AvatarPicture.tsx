"use client";
/** Image loading and fallback state for one person's one profile picture. */

import { useState } from "react";

/**
 * Displays a profile picture or initials after a failed load. The owner keys
 * this component by user ID and URL to isolate image nodes and load events.
 *
 * @param props - Profile picture URL and the person's fallback initials.
 * @returns The picture, or initials when absent or unavailable.
 */
export function AvatarPicture({
  avatarUrl,
  initials,
}: {
  avatarUrl: string;
  initials: string;
}) {
  const [pictureFailed, setPictureFailed] = useState(false);
  if (!avatarUrl || pictureFailed) return initials;

  return (
    // These small third-party CDN images are loaded directly.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover"
      onError={() => setPictureFailed(true)}
    />
  );
}
