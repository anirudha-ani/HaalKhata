"use client";
/** Add-people modal: pick from the people you know; an email or phone finds an already-connected account. */

import Link from "next/link";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { FriendChecklist } from "@/components/people/FriendChecklist";
import { Modal } from "@/components/ui/Modal";

/**
 * Renders the group's add-people form.
 *
 * The ordering is the whole point: people you already know come first as
 * checkboxes, and typing an address is the fallback underneath for somebody
 * you are connected with but who is not on that list — a co-member of another
 * group, say. This used to be the only path — a lone email box — so putting
 * three existing friends in a group meant typing three addresses the app
 * already had on file, one dialog at a time.
 *
 * The address does not create an account. The server enrols only people the
 * caller already shares a friendship or a group with, and refuses anything
 * else with one generic denial, so the field cannot be used to discover who
 * has an account. Somebody genuinely new gets a friend request first.
 *
 * @param props - Component props.
 * @returns The modal.
 */
export function AddPeopleModal({
  groupName,
  candidates,
  pickedIds,
  onToggle,
  identifier,
  onIdentifierChange,
  error,
  canSubmit,
  isPending,
  onSubmit,
  onClose,
}: {
  /** Name of the group being added to, used in the copy. */
  groupName: string;
  /** People available to add — friends who are not already members. */
  candidates: User[];
  /** Ids currently checked. */
  pickedIds: string[];
  /** Called with a person's id when their checkbox is toggled. */
  onToggle: (userId: string) => void;
  /** Raw contents of the email-or-phone fallback field. */
  identifier: string;
  /** Called with the new value as the fallback field is typed in. */
  onIdentifierChange: (identifier: string) => void;
  /** Server error from the last attempt, or "" when there is none. */
  error: string;
  /** Whether anything is selected or typed — the submit button's enablement. */
  canSubmit: boolean;
  /** Whether the add request is in flight. */
  isPending: boolean;
  /** Runs the add. */
  onSubmit: () => void;
  /** Closes the modal. */
  onClose: () => void;
}) {
  return (
    <Modal title={`Add people to ${groupName}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {candidates.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Your people{" "}
              <span className="font-normal text-ink-soft">
                {pickedIds.length > 0 ? `· ${pickedIds.length} selected` : ""}
              </span>
            </p>
            <div className="rounded-xl border border-line bg-paper p-2">
              <FriendChecklist
                autoFocus
                people={candidates}
                selectedIds={pickedIds}
                onToggle={onToggle}
                legend="People to add to this group"
              />
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink-soft">
            Everyone on your{" "}
            <Link href="/friends" className="font-medium text-brand-600">
              friends list
            </Link>{" "}
            is already here. Know somebody from another group? Add them below.
          </p>
        )}

        <div className="space-y-1.5 border-t border-line pt-4">
          <label htmlFor="add-people-identifier" className="block text-sm font-medium">
            Not on the list?
          </label>
          <input
            id="add-people-identifier"
            autoFocus={candidates.length === 0}
            type="text"
            inputMode="email"
            placeholder="Email or phone number"
            value={identifier}
            onChange={(event) => onIdentifierChange(event.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none"
          />
          <p className="text-xs text-ink-soft">
            Works for anyone already connected with you on HaalKhata — a friend, or someone you
            share another group with. New here? Send them a{" "}
            <Link href="/friends" className="font-medium text-brand-600">
              friend request
            </Link>{" "}
            first; once they accept, you can add them.
          </p>
        </div>

        {error ? <p className="text-sm text-brand-600">{error}</p> : null}
        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add to group"}
        </button>
      </form>
    </Modal>
  );
}
