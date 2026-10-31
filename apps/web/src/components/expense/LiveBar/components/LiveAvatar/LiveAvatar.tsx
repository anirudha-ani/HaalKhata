"use client";
/** One person in a live split: their avatar, in a state that says whether they have saved. */

import { Check } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { livePersonLabel } from "@haalkhata/shared/expense/live/live.constants";
import { Avatar } from "@/components/ui/Avatar/Avatar";

/**
 * Renders somebody in a live split. Joined is a faded avatar in a dashed ring;
 * saved is a solid ring with a tick. The ring and the tick say it, not colour
 * alone, and the label says it to anybody who cannot see them.
 *
 * @param props - Component props.
 * @param props.user - The person.
 * @param props.saved - Whether they have pressed Save.
 * @returns The avatar.
 */
export function LiveAvatar({ user, saved }: { user: User; saved: boolean }) {
  const label = livePersonLabel(user.name, saved);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex shrink-0 rounded-full border-2 p-0.5 ${
        saved ? "border-pos-600" : "border-dashed border-ink-soft/50"
      }`}
    >
      <span className={saved ? undefined : "opacity-50"}>
        <Avatar user={user} size="sm" />
      </span>
      {saved ? (
        <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-pos-600 text-white">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}
