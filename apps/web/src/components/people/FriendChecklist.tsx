"use client";
/** Searchable checkbox list of people, the shared middle of every "who?" picker. */

import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { SearchField } from "@/components/ui/SearchField";
import { matchesTerms, searchTerms } from "@haalkhata/shared/search/filter";
import { useScrollEdges } from "@/lib/hooks/useScrollEdges";
import { MAX_VISIBLE_FRIENDS } from "./people.constants";

/**
 * Renders a search box over a checkbox list of people.
 *
 * Extracted because three flows ask the same question (who is on this
 * expense, who is in this new group, who else should join this group) and
 * each had its own copy of the search, the row cap and the overflow hint to
 * drift out of sync. A plain checkbox group is deliberate: it is familiar,
 * keyboard-navigable, and keeps the current selection visible, none of which
 * a `<select multiple>` or a custom combobox manages.
 *
 * Order: people who can be picked come first, in the order given
 * (`listFriends` already puts people you have expenses with first, then the
 * rest alphabetically), and rows that cannot be picked sink to the bottom.
 * They stay visible so "why isn't Rifat here?" answers itself, but they must
 * not sit between the likely picks.
 *
 * The list never grows the page. It is capped at about five rows and scrolls
 * inside, with a fade and a "scroll for more" cue at whichever edge has rows
 * beyond it. A picker that pushes the amount, date and split off screen as
 * the friend count grows is a picker that gets worse with use.
 *
 * Search matches names only. Other people's email and phone are private
 * fields the server no longer sends in any list, so matching on them would
 * be matching on empty strings, and promising it in the placeholder would
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
  disabledIds,
  disabledHint = "",
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
  /**
   * People shown but not selectable, e.g. Invited (unregistered) friends in
   * an expense picker, who cannot be on a transaction until they sign up.
   * Shown rather than hidden so "why isn't Rifat here?" never comes up, and
   * sorted after everyone who can be picked.
   */
  disabledIds?: Set<string>;
  /** Short label rendered on a disabled row saying why. */
  disabledHint?: string;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLFieldSetElement>(null);

  // Pickable rows first, then the rest, each half in its given order.
  const ordered = useMemo(() => {
    if (!disabledIds || disabledIds.size === 0) return people;
    return [
      ...people.filter((person) => !disabledIds.has(person.id)),
      ...people.filter((person) => disabledIds.has(person.id)),
    ];
  }, [people, disabledIds]);

  const matching = useMemo(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) return ordered;
    return ordered.filter((person) => matchesTerms(terms, person.name));
  }, [ordered, query]);
  const visible = matching.slice(0, MAX_VISIBLE_FRIENDS);
  const hiddenCount = matching.length - visible.length;
  // Which edges have rows beyond them, for the fades and the cue.
  const { beforeStart: rowsAbove, afterEnd: rowsBelow, measure } = useScrollEdges(
    listRef,
    "y",
    matching,
  );

  return (
    <div className="space-y-2">
      <SearchField
        autoFocus={autoFocus}
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        label={searchLabel}
      />
      <div className="relative">
        <fieldset ref={listRef} onScroll={measure} className="max-h-60 overflow-y-auto">
          <legend className="sr-only">{legend}</legend>
          {visible.map((person) => {
            const disabled = disabledIds?.has(person.id) ?? false;
            return (
              <label
                key={person.id}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-card"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(person.id)}
                  disabled={disabled}
                  onChange={() => onToggle(person.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                <Avatar user={person} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
                {disabled && disabledHint ? (
                  <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
                    {disabledHint}
                  </span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        {/* Edge cues. Both are overlays so the rows keep their height and
            nothing jumps when the cue appears or goes away. */}
        {rowsAbove ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-linear-to-b from-paper to-transparent"
          />
        ) : null}
        {rowsBelow ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-linear-to-t from-paper via-paper/80 to-transparent pb-1"
          >
            <span className="flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line">
              <ChevronDown className="h-3 w-3" /> Scroll for more
            </span>
          </div>
        ) : null}
      </div>
      {matching.length === 0 ? (
        <p className="px-2 pb-1 text-sm text-ink-soft">No one matches “{query}”.</p>
      ) : hiddenCount > 0 ? (
        <p className="px-2 pb-1 text-xs text-ink-soft">
          Showing {visible.length} of {matching.length}. Keep typing to narrow it down.
        </p>
      ) : null}
    </div>
  );
}
