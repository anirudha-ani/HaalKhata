"use client";
/** Searchable checkbox list of people — the shared middle of every "who?" picker. */

import { useMemo, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { SearchField } from "@/components/ui/SearchField";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { MAX_VISIBLE_FRIENDS, SCROLLING_LIST_THRESHOLD } from "./people.constants";

/**
 * Renders a search box over a checkbox list of people.
 *
 * Extracted because three flows ask the same question — who is on this
 * expense, who is in this new group, who else should join this group — and
 * each had its own copy of the search, the row cap and the overflow hint to
 * drift out of sync. A plain checkbox group is deliberate: it is familiar,
 * keyboard-navigable, and keeps the current selection visible, none of which
 * a `<select multiple>` or a custom combobox manages.
 *
 * The incoming order is preserved rather than re-ranked: `listFriends`
 * already returns people you have expenses with first, then the rest
 * alphabetically, so the likely picks are at the top before a keystroke.
 *
 * Search matches names only. Other people's email and phone are private
 * fields the server no longer sends in any list, so matching on them would
 * be matching on empty strings — and promising it in the placeholder would
 * be a lie.
 *
 * @param props - Component props.
 * @returns The search field and checkbox list.
 */
export function FriendChecklist({
  people,
  selectedIds,
  onToggle,
  legend,
  searchLabel = "Search friends",
  placeholder = "Search by name",
  autoFocus = false,
}: {
  /** Everyone selectable, in the order they should be offered. */
  people: User[];
  /** Ids currently checked. */
  selectedIds: string[];
  /** Called with a person's id when their checkbox is toggled. */
  onToggle: (userId: string) => void;
  /** Screen-reader name for the group of checkboxes. */
  legend: string;
  /** Screen-reader label for the search field. */
  searchLabel?: string;
  /** Placeholder text in the search field. */
  placeholder?: string;
  /** Whether to focus the search field on mount. */
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");

  const matching = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return people;
    return people.filter((person) => matchesTerms(terms, person.name));
  }, [people, query]);
  const visible = matching.slice(0, MAX_VISIBLE_FRIENDS);
  const hiddenCount = matching.length - visible.length;

  return (
    <div className="space-y-2">
      <SearchField
        autoFocus={autoFocus}
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        label={searchLabel}
      />
      <fieldset className={people.length > SCROLLING_LIST_THRESHOLD ? "max-h-64 overflow-y-auto" : ""}>
        <legend className="sr-only">{legend}</legend>
        {visible.map((person) => (
          <label
            key={person.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-card"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(person.id)}
              onChange={() => onToggle(person.id)}
              className="h-4 w-4 accent-brand-600"
            />
            <Avatar user={person} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
          </label>
        ))}
      </fieldset>
      {matching.length === 0 ? (
        <p className="px-2 pb-1 text-sm text-ink-soft">No one matches “{query}”.</p>
      ) : hiddenCount > 0 ? (
        <p className="px-2 pb-1 text-xs text-ink-soft">
          Showing {visible.length} of {matching.length} — keep typing to narrow it down.
        </p>
      ) : null}
    </div>
  );
}
