"use client";
/** "Who's on this?" picker: participant chips, a friend checkbox list, and the group select. */

import Link from "next/link";
import { ChevronDown, UserPlus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { SearchField } from "@/components/ui/SearchField";
import { matchesTerms, searchTerms } from "@/lib/search/filter";
import { MAX_VISIBLE_FRIENDS, SCROLLING_LIST_THRESHOLD } from "./people.constants";

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
  disabled = false,
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
  /** Whether the whole picker is locked (the cast of a saved expense cannot move). */
  disabled?: boolean;
}) {
  const fieldId = useId();
  // Open on a blank form, where picking people is the next thing to do; closed
  // once there is a cast, so the chips are not pushed off screen. Read once —
  // reacting to `people` would make the panel jump on every selection.
  const [isOpen, setIsOpen] = useState(() => people.length <= 1 && groupId === "");
  const [query, setQuery] = useState("");
  // Focus the search box only when the user opens the panel themselves —
  // autofocusing on the initial render would pop the keyboard open the moment
  // the Add expense page loads.
  const [focusSearch, setFocusSearch] = useState(false);

  const isGroupExpense = groupId !== "";
  const selectedGroupName = groups.find((group) => group.id === groupId)?.name ?? "";

  // `friends` arrives from listFriends already ordered by relevance —
  // everyone you have expenses with first, then the rest alphabetically — so
  // the people most likely to be picked are at the top before a single
  // keystroke. Filtering preserves that order rather than re-ranking.
  const matchingFriends = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return friends;
    return friends.filter((friend) =>
      matchesTerms(terms, friend.name, friend.email, friend.phone),
    );
  }, [friends, query]);
  const visibleFriends = matchingFriends.slice(0, MAX_VISIBLE_FRIENDS);
  const hiddenCount = matchingFriends.length - visibleFriends.length;

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
            const isRemovable = !isSelf && !isGroupExpense && !disabled;
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
        ) : disabled ? null : friends.length === 0 ? (
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
              <div className="space-y-2 rounded-xl border border-line bg-paper p-2">
                <SearchField
                  autoFocus={focusSearch}
                  value={query}
                  onChange={setQuery}
                  placeholder="Search by name, email or phone"
                  label="Search friends"
                />
                {/* A plain checkbox group: familiar, keyboard-navigable, and
                    it keeps the current selection visible — none of which a
                    <select multiple> or a custom combobox manages. */}
                <fieldset
                  className={
                    friends.length > SCROLLING_LIST_THRESHOLD ? "max-h-64 overflow-y-auto" : ""
                  }
                >
                  <legend className="sr-only">Friends on this expense</legend>
                  {visibleFriends.map((friend) => (
                    <label
                      key={friend.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-card"
                    >
                      <input
                        type="checkbox"
                        checked={friendIds.includes(friend.id)}
                        onChange={() => onToggleFriend(friend.id)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      <Avatar user={friend} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {friend.name}
                      </span>
                    </label>
                  ))}
                </fieldset>
                {matchingFriends.length === 0 ? (
                  <p className="px-2 pb-1 text-sm text-ink-soft">
                    No friends match “{query}”.
                  </p>
                ) : hiddenCount > 0 ? (
                  <p className="px-2 pb-1 text-xs text-ink-soft">
                    Showing {visibleFriends.length} of {matchingFriends.length} — keep typing to
                    narrow it down.
                  </p>
                ) : null}
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
            disabled={disabled || groups.length === 0}
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
          >
            <option value="">No group (one-off)</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
