"use client";
/** "Who's on this?" picker: participant chips, a friend checkbox list, and the group select. */

import Link from "next/link";
import { ChevronDown, UserPlus, X } from "lucide-react";
import { useId, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { FriendChecklist } from "./FriendChecklist";

/** A group as this picker needs it — enough to label one option. */
export interface PickerGroup {
  /** Group id, used as the select value. */
  id: string;
  /** Group name shown in the select. */
  name: string;
}

/**
 * Renders the cast of an expense: one chip per participant, a disclosure over
 * a searchable friend list for adding more, and a separate group select.
 *
 * Group and ad-hoc people are alternatives, not layers — the server requires
 * every participant of a group expense to be a member of it, so picking a
 * group takes over the cast and hides the add-people control. Picking "No
 * group" hands it back.
 *
 * When editing, only the scope is locked: a saved expense cannot move
 * between a group and a one-off ledger (the server pins it, because
 * settlements live in the scope), but who is on it can still change — the
 * server recomputes the splits and locks both the old and the new cast.
 *
 * @param props - Component props.
 * @returns The participant picker section.
 */
export function PeoplePicker({
  me: currentUser,
  people,
  friends,
  groups,
  groupId,
  friendIds,
  onGroupChange,
  onToggleFriend,
  scopeLocked = false,
}: {
  /** The signed-in user, pinned as the first chip and labelled "You". */
  me: User | undefined;
  /** The resolved cast, in display order; rendered as chips. */
  people: User[];
  /** Everyone who can be added to a one-off expense. */
  friends: User[];
  /** Groups the signed-in user belongs to. */
  groups: PickerGroup[];
  /** Currently selected group id, or "" for a one-off expense. */
  groupId: string;
  /** Ids of the ad-hoc participants (empty while a group is selected). */
  friendIds: string[];
  /** Called with the new group id ("" for none) when the group select changes. */
  onGroupChange: (groupId: string) => void;
  /** Called with a friend's id to add or remove them from the ad-hoc cast. */
  onToggleFriend: (userId: string) => void;
  /** Whether the group/one-off choice is locked (a saved expense cannot change scope). */
  scopeLocked?: boolean;
}) {
  const fieldId = useId();
  // Open on a blank form, where picking people is the next thing to do; closed
  // once there is a cast, so the chips are not pushed off screen. Read once —
  // reacting to `people` would make the panel jump on every selection.
  const [isOpen, setIsOpen] = useState(() => people.length <= 1 && groupId === "");
  // Focus the search box only when the user opens the panel themselves —
  // autofocusing on the initial render would pop the keyboard open the moment
  // the Add expense page loads.
  const [focusSearch, setFocusSearch] = useState(false);

  const isGroupExpense = groupId !== "";
  const selectedGroupName = groups.find((group) => group.id === groupId)?.name ?? "";

  if (groups.length === 0 && friends.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
          Who&apos;s on this?
        </h2>
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
          You need a{" "}
          <Link href="/friends" className="font-medium text-brand-600">
            friend
          </Link>{" "}
          or a{" "}
          <Link href="/groups" className="font-medium text-brand-600">
            group
          </Link>{" "}
          first.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
        Who&apos;s on this?
      </h2>

      <div className="space-y-3 rounded-2xl border border-line bg-card p-3">
        <ul className="flex flex-wrap items-center gap-1.5">
          {people.map((person) => {
            const isSelf = person.id === currentUser?.id;
            // You are always on your own expense, and a group's members come
            // from the group — neither is removable here.
            const isRemovable = !isSelf && !isGroupExpense;
            return (
              <li key={person.id}>
                <span
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full bg-paper pl-1 ring-1 ring-line ${
                    isRemovable ? "pr-1" : "pr-3"
                  }`}
                >
                  <Avatar user={person} size="xsmall" />
                  <span className="max-w-40 truncate text-sm font-medium">
                    {isSelf ? "You" : person.name}
                  </span>
                  {isRemovable ? (
                    <button
                      type="button"
                      onClick={() => onToggleFriend(person.id)}
                      aria-label={`Remove ${person.name}`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft hover:bg-line hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        {isGroupExpense ? (
          <p className="text-sm text-ink-soft">
            Everyone in {selectedGroupName} is on this — leave someone out by
            unchecking them under Split.
          </p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-ink-soft">
            <Link href="/friends" className="font-medium text-brand-600">
              Add a friend
            </Link>{" "}
            to split this with someone, or pick a group below.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setIsOpen(!isOpen);
                setFocusSearch(true);
              }}
              aria-expanded={isOpen}
              className="flex items-center gap-1.5 text-sm font-semibold text-brand-600"
            >
              <UserPlus className="h-4 w-4" />
              Add people
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen ? (
              <div className="rounded-xl border border-line bg-paper p-2">
                <FriendChecklist
                  people={friends}
                  selectedIds={friendIds}
                  onToggle={onToggleFriend}
                  legend="Friends on this expense"
                  autoFocus={focusSearch}
                />
              </div>
            ) : null}
          </>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-3">
          <label htmlFor={`${fieldId}-group`} className="text-sm font-medium text-ink-soft">
            Group
          </label>
          <select
            id={`${fieldId}-group`}
            value={groupId}
            onChange={(event) => onGroupChange(event.target.value)}
            disabled={scopeLocked || groups.length === 0}
            title={scopeLocked ? "A saved expense cannot move between groups" : undefined}
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
          >
            <option value="">No group (one-off)</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {scopeLocked ? (
            <span className="shrink-0 text-xs text-ink-soft">can&apos;t change once saved</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
