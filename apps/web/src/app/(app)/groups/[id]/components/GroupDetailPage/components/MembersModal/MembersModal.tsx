"use client";
/** Modal listing a group's members with their friendship state and per-person actions. */

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, UserPlus } from "lucide-react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { errorMessage, socialClient } from "@/lib/api/connect";
import { Avatar } from "@/components/ui/Avatar";
import { PersonLink } from "@/components/people/PersonLink";
import { Modal } from "@/components/ui/Modal";

/**
 * Renders the group's people as a proper list: every member, full name, and
 * where you stand with each — the avatar strip on the page names them but
 * offers nothing to do about any of them.
 *
 * Per row:
 * - you: marked, no actions.
 * - a friend: the row links to your shared ledger with them.
 * - not (yet) a friend: a request button — the recipient must accept before
 *   friendship exists — and the row still links to the shared ledger, which
 *   works for any pair with group or ledger history.
 *
 * @returns The members modal.
 */
export function MembersModal({
  members,
  meId,
  friendIds,
  onClose,
}: {
  /** The group's members, in the order the group returns them. */
  members: User[];
  /** The signed-in user's id, to mark their own row. */
  meId: string | undefined;
  /** Ids the caller already has a friendship with. */
  friendIds: Set<string>;
  /** Called when the modal is dismissed. */
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  // The server deliberately does not expose outgoing-request state, so this
  // local marker prevents accidental duplicate taps during the open modal.
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const addFriend = useMutation({
    mutationFn: (targetUserId: string) =>
      socialClient.addFriend({ email: "", phone: "", name: "", userId: targetUserId }),
    onSuccess: (_acknowledgement, targetUserId) => {
      setRequestedIds((existing) => new Set([...existing, targetUserId]));
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal title={`Members (${members.length})`} onClose={onClose}>
      <ul className="divide-y divide-line">
        {members.map((member) => {
          const isMe = member.id === meId;
          const isFriend = friendIds.has(member.id);
          const requested = requestedIds.has(member.id);
          return (
            <li key={member.id} className="flex items-center gap-3 py-2.5">
              <PersonLink
                userId={member.id}
                meId={meId}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar user={member} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {member.name}
                    {isMe ? (
                      <span className="ml-1.5 text-xs font-normal text-ink-soft">you</span>
                    ) : null}
                  </span>
                  {member.email ? (
                    <span className="block truncate text-xs text-ink-soft">{member.email}</span>
                  ) : null}
                </span>
              </PersonLink>
              {isMe ? null : isFriend ? (
                <Link
                  href={`/friends/${member.id}`}
                  className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600"
                >
                  Ledger <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={addFriend.isPending || requested}
                  onClick={() => addFriend.mutate(member.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" /> {requested ? "Requested" : "Request"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-sm text-brand-600">{error}</p> : null}
    </Modal>
  );
}
