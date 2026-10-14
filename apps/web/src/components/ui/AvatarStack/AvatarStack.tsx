/** Avatar stack: overlapping avatars in a fixed number of slots, the overflow shown as "+N". */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "../Avatar/Avatar";
import { AVATAR_SIZES } from "../Avatar/constants/avatarSizes";
import { capStack } from "./utils/capStack";

/**
 * Renders people as a row of overlapping avatars that never grows past
 * `slots` circles. A stack that draws everyone cannot shrink, so with a
 * dozen people it either pushes its neighbours out of the row or paints over
 * them; this one stops at a known width and counts the rest.
 *
 * The hidden people stay reachable: their names are the count's tooltip, and
 * a stack is always a summary beside a way into the full list.
 *
 * @param props - Component props.
 * @returns The stack, or an empty span when there is nobody to show.
 */
export function AvatarStack({
  users,
  slots,
  size = "sm",
}: {
  /** The people to show, in display order. */
  users: Pick<User, "id" | "name" | "avatarColor" | "avatarUrl">[];
  /** How many circles the stack may take, the "+N" count included. */
  slots: number;
  /** Avatar size variant; defaults to "sm". */
  size?: keyof typeof AVATAR_SIZES;
}) {
  const { shown, hiddenCount } = capStack(users, slots);
  return (
    <span className="flex shrink-0 -space-x-2">
      {shown.map((user) => (
        <Avatar key={user.id} user={user} size={size} ring />
      ))}
      {hiddenCount > 0 ? (
        <span
          title={users
            .slice(shown.length)
            .map((user) => user.name)
            .join(", ")}
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-paper font-semibold text-ink-soft ring-2 ring-card select-none ${AVATAR_SIZES[size]}`}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}
