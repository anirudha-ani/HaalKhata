"use client";
/** Modal listing a group's members with their friendship state and per-person actions. */

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Crown, LogOut, Send, UserMinus, UserPlus } from "lucide-react";
import type { Member } from "@haalkhata/protogen/group/v1/group_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { OWNER_ROLE } from "@haalkhata/shared/group/roles";
import { errorMessage, socialClient } from "@/lib/api/connect";
import { Avatar } from "@/components/ui/Avatar";
import { PersonLink } from "@/components/people/PersonLink";
import { Modal } from "@/components/ui/Modal";

/** Shared styling for the small outline action buttons on a member row. */
const rowActionClass =
  "flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:text-brand-600 disabled:opacity-50";

/**
 * Renders the group's people as a proper list: every member, full name, and
 * where you stand with each — the avatar strip on the page names them but
 * offers nothing to do about any of them.
 *
 * Per row:
 * - you: marked, and a "Leave group" button unless you own the group.
 * - a friend: the row links to your shared ledger with them.
 * - not (yet) a friend: a request button — the recipient must accept before
 *   friendship exists — and the row still links to the shared ledger, which
 *   works for any pair with group or ledger history.
 * - anyone else, when you own the group: "Make owner" and "Remove" buttons.
 *
 * Leaving and removing are one RPC under one rule: the server refuses while
 * that person still has a balance here, and its message is the honest one to
 * show. Leaving is what makes membership consensual — any member may enrol
 * you, so you must be able to walk out again. Handing the group on is what
 * lets the owner do the same: the old owner becomes an ordinary member and
 * gets the "Leave group" button like everyone else.
 *
 * @returns The members modal.
 */
export function MembersModal({
  members,
  meId,
  friendIds,
  onRemove,
  removingUserId,
  onTransfer,
  transferringUserId,
  onRemind,
  remindingUserId,
  onResetLink,
  resettingLink,
  removeError,
  onClose,
}: {
  /** The group's members with their roles, in the order the group returns them. */
  members: Member[];
  /** The signed-in user's id, to mark their own row. */
  meId: string | undefined;
  /** Ids the caller already has a friendship with. */
  friendIds: Set<string>;
  /** Called with a member's id to remove them; the caller's own id means leaving. */
  onRemove: (userId: string) => void;
  /** Id of the member whose removal is in flight, if any. */
  removingUserId: string | undefined;
  /** Called with a member's id to make them the owner (owner only). */
  onTransfer: (userId: string) => void;
  /** Id of the member being made owner, while that is in flight. */
  transferringUserId: string | undefined;
  /** Shares an Invited member's personal sign-up link. */
  onRemind: (person: User) => void;
  /** Member whose remind-share is in flight, for the row's busy state. */
  remindingUserId: string | undefined;
  /** Owner-only: turns the group's shared join link off. */
  onResetLink: () => void;
  /** Whether the link reset is in flight. */
  resettingLink: boolean;
  /** Server message from the last failed removal or transfer, or "" when there is none. */
  removeError: string;
  /** Called when the modal is dismissed. */
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  // The server deliberately does not expose outgoing-request state, so this
  // local marker prevents accidental duplicate taps during the open modal.
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const viewerIsOwner = members.some(
    (member) => member.user?.id === meId && member.role === OWNER_ROLE,
  );

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
          const person = member.user;
          if (!person) return null;
          const isMe = person.id === meId;
          const isOwner = member.role === OWNER_ROLE;
          const isFriend = friendIds.has(person.id);
          const requested = requestedIds.has(person.id);
          const removing = removingUserId === person.id;
          const transferring = transferringUserId === person.id;
          return (
            <li key={person.id} className="flex items-center gap-2 py-2.5">
              <PersonLink
                userId={person.id}
                meId={meId}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar user={person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {person.name}
                    {isMe ? (
                      <span className="ml-1.5 text-xs font-normal text-ink-soft">you</span>
                    ) : null}
                    {isOwner ? (
                      <span className="ml-1.5 text-xs font-normal text-ink-soft">owner</span>
                    ) : null}
                    {!person.registered ? (
                      <span className="ml-1.5 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        invited
                      </span>
                    ) : null}
                  </span>
                </span>
              </PersonLink>
              {isMe ? (
                isOwner ? null : (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => onRemove(person.id)}
                    className={rowActionClass}
                  >
                    <LogOut className="h-3.5 w-3.5" /> {removing ? "Leaving…" : "Leave group"}
                  </button>
                )
              ) : (
                <>
                  {!person.registered ? (
                    <button
                      type="button"
                      disabled={remindingUserId === person.id}
                      onClick={() => onRemind(person)}
                      className={rowActionClass}
                    >
                      <Send className="h-3.5 w-3.5" />{" "}
                      {remindingUserId === person.id ? "Sharing…" : "Remind"}
                    </button>
                  ) : isFriend ? (
                    <Link href={`/friends/${person.id}`} className={rowActionClass}>
                      Ledger <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={addFriend.isPending || requested}
                      onClick={() => addFriend.mutate(person.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> {requested ? "Requested" : "Request"}
                    </button>
                  )}
                  {viewerIsOwner ? (
                    <>
                      <button
                        type="button"
                        disabled={transferring}
                        onClick={() => onTransfer(person.id)}
                        aria-label={`Make ${person.name} the owner`}
                        className={rowActionClass}
                      >
                        <Crown className="h-3.5 w-3.5" /> {transferring ? "Handing over…" : "Make owner"}
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => onRemove(person.id)}
                        aria-label={`Remove ${person.name} from the group`}
                        className={rowActionClass}
                      >
                        <UserMinus className="h-3.5 w-3.5" /> {removing ? "Removing…" : "Remove"}
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error || removeError ? (
        <p className="mt-3 text-sm text-brand-600">{error || removeError}</p>
      ) : null}
      {viewerIsOwner ? (
        /* Revocation kills a link every member may have shared — the
           destructive direction, so it sits with the owner like removal. */
        <button
          type="button"
          disabled={resettingLink}
          onClick={onResetLink}
          className="mt-3 text-xs font-semibold text-ink-soft underline-offset-2 hover:text-brand-600 hover:underline disabled:opacity-50"
        >
          {resettingLink ? "Turning off…" : "Turn off the group's invite link"}
        </button>
      ) : null}
    </Modal>
  );
}
