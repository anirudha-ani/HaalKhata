/** Initials avatar circle tinted with the user's avatarColor. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { AVATAR_SIZES } from "./ui.constants";

/**
 * Renders a circular avatar showing the user's initials (up to two) on a
 * background tinted with the user's avatarColor.
 */
export function Avatar({
  user,
  size = "md",
  ring = false,
}: {
  /** The user to represent; only `name` and `avatarColor` are used. */
  user: Pick<User, "name" | "avatarColor">;
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${AVATAR_SIZES[size]} ${ring ? "ring-2 ring-card" : ""}`}
      style={{ backgroundColor: user.avatarColor || "#857a68" }}
    >
      {initials || "?"}
    </span>
  );
}
