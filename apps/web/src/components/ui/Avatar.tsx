"use client";
/** Avatar circle: the person's Google picture, falling back to tinted initials. */

import { useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { AVATAR_SIZES } from "./ui.constants";

/**
 * Renders a circular avatar. Shows the person's Google profile picture when
 * there is one, and their initials on a background tinted with avatarColor
 * otherwise.
 *
 * The initials are not a legacy path: `avatarUrl` is empty for everyone who
 * was invited rather than signed in, and Google's picture claim is documented
 * as never guaranteed even for those who did. A picture that fails to load —
 * these are hotlinks to Google's CDN and the URLs are not contractually
 * stable — falls back to the same initials rather than a broken image.
 */
export function Avatar({
  user,
  size = "md",
  ring = false,
}: {
  /** The user to represent; `name`, `avatarColor` and `avatarUrl` are used. */
  user: Pick<User, "name" | "avatarColor" | "avatarUrl">;
  /** Size variant; defaults to "md". */
  size?: keyof typeof AVATAR_SIZES;
  /** Whether to draw a card-colored ring around the circle (for overlapping stacks). */
  ring?: boolean;
}) {
  const [pictureFailed, setPictureFailed] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const showPicture = user.avatarUrl.length > 0 && !pictureFailed;

  return (
    <span
      title={user.name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none ${AVATAR_SIZES[size]} ${ring ? "ring-2 ring-card" : ""}`}
      style={{ backgroundColor: user.avatarColor || "#857a68" }}
    >
      {showPicture ? (
        // Plain <img>, not next/image: these are third-party URLs that would
        // otherwise need a remotePatterns entry, and there is nothing to
        // optimize about an already-tiny square served from a CDN. Routing
        // them through next/image would hide viewers' IPs from Google, which
        // is the one real argument for it — revisit if that matters more than
        // the added config and per-request work.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setPictureFailed(true)}
        />
      ) : (
        (initials || "?")
      )}
    </span>
  );
}
