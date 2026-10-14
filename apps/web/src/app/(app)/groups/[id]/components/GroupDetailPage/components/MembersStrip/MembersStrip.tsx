"use client";
/** Members strip: the group's people at a glance, a way into the full list, and the two ways to bring someone in. */

import { Link2, UserPlus } from "lucide-react";
import type { Member } from "@haalkhata/protogen/group/v1/group_pb";
import { AvatarStack } from "@/components/ui/AvatarStack/AvatarStack";
import { MEMBERS_STRIP_AVATAR_SLOTS, stripActionClass } from "./constants/membersStrip";

/**
 * Renders the strip under a group's header. The avatars-and-names run is a
 * button into the full member list — a truncated line of first names is a
 * summary, not a way to reach anyone — and beside it sit "Add people" and
 * "Invite link".
 *
 * On a phone the summary takes a row of its own and the two actions share
 * the next one. Side by side there was no width left for the summary, and a
 * dozen avatars that cannot shrink were painted straight over "Add people".
 * The stack is capped for the same reason: it has to stay a known width
 * however large the group gets.
 *
 * @param props - Component props.
 * @returns The members strip.
 */
export function MembersStrip({
  members,
  meId,
  onViewMembers,
  onAddPeople,
  onShareInviteLink,
  sharingInviteLink,
}: {
  /** The group's members, in the order the group returns them. */
  members: Member[];
  /** The signed-in user's id, shown as "You" in the names. */
  meId: string | undefined;
  /** Opens the full member list. */
  onViewMembers: () => void;
  /** Opens the add-people modal. */
  onAddPeople: () => void;
  /** Shares the group's join link. */
  onShareInviteLink: () => void;
  /** Whether the join link is being prepared for sharing. */
  sharingInviteLink: boolean;
}) {
  const people = members.flatMap((member) => (member.user ? [member.user] : []));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3">
      <button
        type="button"
        onClick={onViewMembers}
        aria-label={`View all ${people.length} members`}
        className="flex min-w-0 basis-full cursor-pointer items-center gap-2 text-left sm:flex-1 sm:basis-0"
      >
        <AvatarStack users={people} slots={MEMBERS_STRIP_AVATAR_SLOTS} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
          {people
            .map((person) => (person.id === meId ? "You" : person.name.split(" ")[0]))
            .join(", ")}
        </span>
      </button>
      <button type="button" onClick={onAddPeople} className={stripActionClass}>
        <UserPlus className="h-3.5 w-3.5" /> Add people
      </button>
      <button
        type="button"
        disabled={sharingInviteLink}
        onClick={onShareInviteLink}
        title="Share a link anyone can use to join this group"
        className={stripActionClass}
      >
        <Link2 className="h-3.5 w-3.5" />
        {sharingInviteLink ? "Opening…" : "Invite link"}
      </button>
    </div>
  );
}
