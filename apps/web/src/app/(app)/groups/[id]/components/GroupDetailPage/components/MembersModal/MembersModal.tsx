"use client";
/** Modal listing a group's members with their friendship state and per-person actions. */

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Crown, LogOut, Send, UserMinus, UserPlus } from "lucide-react";
import type { Member } from "@haalkhata/protogen/group/v1/group_pb";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import {
  memberActionPrompt,
  memberRemovalBlock,
  type MemberAction,
  type MemberFeedback,
} from "@haalkhata/shared/group/memberActions";
import { OWNER_ROLE } from "@haalkhata/shared/group/roles";
import { errorMessage, socialClient } from "@/lib/api/connect";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { PersonLink } from "@/components/people/PersonLink/PersonLink";
import { Modal } from "@/components/ui/Modal/Modal";
import { ConfirmMemberAction } from "./components/ConfirmMemberAction/ConfirmMemberAction";
import { MemberActionBlocked } from "./components/MemberActionBlocked/MemberActionBlocked";
import { MemberFeedbackNote } from "./components/MemberFeedbackNote/MemberFeedbackNote";
import { rowActionClass } from "./constants/membersModal";

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
 * - anyone else, when you own the group: "Make owner" and "Remove" buttons,
 *   with all of that person's actions on a line under their name.
 *
 * Leaving and removing are one RPC under one rule: the server refuses while
 * that person still has a balance here, and its message is the honest one to
 * show. Leaving is what makes membership consensual — any member may enrol
 * you, so you must be able to walk out again. Handing the group on is what
 * lets the owner do the same: the old owner becomes an ordinary member and
 * gets the "Leave group" button like everyone else.
 *
 * Those three — remove, leave, make owner — ask before they act. They are
 * small buttons sitting beside each other and beside "Ledger", and a slip of
 * the thumb used to be enough to hand the group to somebody else. The first
 * tap now turns that person's row into the question; only its confirm button
 * calls the server. One row asks at a time.
 *
 * Nothing here fails silently. A removal the ledger will refuse — the
 * person still owes or is owed money in the group — is explained instead of
 * offered: the row says how much is outstanding and points to the balances,
 * and no request is sent. Whatever the server still refuses, and whatever a
 * row's action confirms, is shown under that person's row, where the tap
 * was; a line under the whole list is off screen in any group long enough
 * to scroll.
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
  feedback,
  nets,
  currency,
  onViewBalances,
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
  /** The last failure or confirmation from an action here, and the row it belongs under. */
  feedback: MemberFeedback | null;
  /** Each member's net in the group (> 0 means they are owed); empty until balances load. */
  nets: { userId: string; netCents: number }[];
  /** The group's ISO 4217 currency code, for the amounts in a refusal. */
  currency: string;
  /** Closes this list and shows the group's balances. */
  onViewBalances: () => void;
  /** Called when the modal is dismissed. */
  onClose: () => void;
}) {
  // A failed friend request, kept with the row it was sent from.
  const [requestError, setRequestError] = useState<{ userId: string; message: string } | null>(
    null,
  );
  // The server deliberately does not expose outgoing-request state, so this
  // local marker prevents accidental duplicate taps during the open modal.
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  // The member action waiting on its confirmation, if any.
  const [pending, setPending] = useState<{ userId: string; action: MemberAction } | null>(null);
  const viewerIsOwner = members.some(
    (member) => member.user?.id === meId && member.role === OWNER_ROLE,
  );

  const addFriend = useMutation({
    mutationFn: (targetUserId: string) =>
      socialClient.addFriend({ email: "", phone: "", name: "", userId: targetUserId }),
    onSuccess: (_acknowledgement, targetUserId) => {
      setRequestedIds((existing) => new Set([...existing, targetUserId]));
    },
    onError: (mutationError, targetUserId) =>
      setRequestError({ userId: targetUserId, message: errorMessage(mutationError) }),
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
          const armed = pending?.userId === person.id ? pending.action : null;
          // Only a removal can be refused for a balance; handing the group
          // over is allowed whatever anyone owes.
          const block =
            armed === "remove"
              ? memberRemovalBlock(
                  person.name,
                  isMe,
                  nets.find((position) => position.userId === person.id)?.netCents ?? 0,
                  currency,
                )
              : null;
          const note: { tone: "error" | "success"; message: string } | null =
            requestError?.userId === person.id
              ? { tone: "error", message: requestError.message }
              : feedback?.userId === person.id
                ? feedback
                : null;
          // An owner gets three actions per person, which no name survives
          // sharing a row with: on a phone it was squeezed to an initial.
          // Those rows put the actions on a line of their own under the
          // name; a row with one action keeps it beside the name. A row that
          // is asking its question, or has something to report, always needs
          // the line underneath.
          const stacked = (viewerIsOwner && !isMe) || armed !== null || note !== null;
          return (
            <li
              key={person.id}
              className={stacked ? "space-y-2 py-3" : "flex items-center gap-2 py-2.5"}
            >
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
              {armed && block ? (
                <MemberActionBlocked
                  block={block}
                  onClose={() => setPending(null)}
                  onViewBalances={onViewBalances}
                />
              ) : armed ? (
                <ConfirmMemberAction
                  prompt={memberActionPrompt(armed, person.name, isMe)}
                  onCancel={() => setPending(null)}
                  onConfirm={() => {
                    setPending(null);
                    if (armed === "transfer") onTransfer(person.id);
                    else onRemove(person.id);
                  }}
                />
              ) : isMe ? (
                isOwner ? null : (
                  <div className={stacked ? "flex flex-wrap gap-2 sm:pl-10" : "contents"}>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => setPending({ userId: person.id, action: "remove" })}
                      className={rowActionClass}
                    >
                      <LogOut className="h-3.5 w-3.5" /> {removing ? "Leaving…" : "Leave group"}
                    </button>
                  </div>
                )
              ) : (
                <div className={stacked ? "flex flex-wrap gap-2 sm:pl-10" : "contents"}>
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
                      onClick={() => {
                        setRequestError(null);
                        addFriend.mutate(person.id);
                      }}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:py-1.5"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> {requested ? "Requested" : "Request"}
                    </button>
                  )}
                  {viewerIsOwner ? (
                    <>
                      <button
                        type="button"
                        disabled={transferring}
                        onClick={() => setPending({ userId: person.id, action: "transfer" })}
                        aria-label={`Make ${person.name} the owner`}
                        className={rowActionClass}
                      >
                        <Crown className="h-3.5 w-3.5" /> {transferring ? "Handing over…" : "Make owner"}
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => setPending({ userId: person.id, action: "remove" })}
                        aria-label={`Remove ${person.name} from the group`}
                        className={rowActionClass}
                      >
                        <UserMinus className="h-3.5 w-3.5" /> {removing ? "Removing…" : "Remove"}
                      </button>
                    </>
                  ) : null}
                </div>
              )}
              {note ? <MemberFeedbackNote tone={note.tone} message={note.message} indented /> : null}
            </li>
          );
        })}
      </ul>
      {/* Only what is about the list as a whole lands here, beside the
          control that caused it; anything about one person is on their row. */}
      {feedback && feedback.userId === null ? (
        <div className="mt-3">
          <MemberFeedbackNote tone={feedback.tone} message={feedback.message} />
        </div>
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
