"use client";
/** Avatar circle: the person's Google picture, falling back to tinted initials. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { AvatarPicture } from "./components/AvatarPicture/AvatarPicture";
import { AVATAR_SIZES } from "./constants/avatarSizes";

/**
 * Renders a circular avatar. Shows the person's Google profile picture when
 * there is one, and their initials on a background tinted with avatarColor
 * otherwise.
 *
 * The initials are not a legacy path: `avatarUrl` is empty for everyone who
 * signed in without Google, and Google's picture claim is documented as
 * never guaranteed even for those who did. A picture that fails to load —
 * these are hotlinks to Google's CDN and the URLs are not contractually
 * stable — falls back to the same initials rather than a broken image.
 */
export function Avatar({
  user,
  size = "md",
  ring = false,
}: {
  /** The user's identity, display name, tint and profile picture. */
  user: Pick<User, "id" | "name" | "avatarColor" | "avatarUrl">;
  /** Size variant; defaults to "md". */
  size?: keyof typeof AVATAR_SIZES;
  /** Whether to draw a card-colored ring around the circle (for overlapping stacks). */
  ring?: boolean;
}) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      title={user.name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none ${AVATAR_SIZES[size]} ${ring ? "ring-2 ring-card" : ""}`}
      style={{ backgroundColor: user.avatarColor || "#857a68" }}
    >
      {/* Replacing the identity or URL replaces the image node and its error
          state together, so an old image/load event cannot follow new props. */}
      <AvatarPicture
        key={JSON.stringify([user.id, user.avatarUrl])}
        avatarUrl={user.avatarUrl}
        initials={initials || "?"}
      />
    </span>
  );
}
