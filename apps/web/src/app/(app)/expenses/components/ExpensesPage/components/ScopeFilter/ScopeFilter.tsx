"use client";
/** Scope filter for the expenses page: All, One-off, and a searchable picker for one group. */

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  FIXED_SCOPE_OPTIONS,
  GROUP_SCOPE_LABEL,
  SCOPE_PICKER_SEARCH_THRESHOLD,
  isGroupScope,
  scopePickerGroups,
  type ExpenseScopeFilter,
} from "@haalkhata/shared/expense/scopeFilter";
import { SearchField } from "@/components/ui/SearchField/SearchField";
import {
  SCOPE_CHIP_ACTIVE_CLASS,
  SCOPE_CHIP_CLASS,
  SCOPE_CHIP_IDLE_CLASS,
} from "./constants/scopeFilter";

/**
 * Renders the row that narrows the expense list by where an expense lives:
 * everywhere, outside any group, or in one group.
 *
 * The two fixed scopes are chips. Groups used to be chips too, one each,
 * which read well with three groups and buried the list under rows of chips
 * with thirty. They are now one button that opens a list: it scrolls, it
 * grows a search box once there are enough groups to need one, and the
 * button takes the picked group's name so the row still says what is being
 * shown. Picking "All" or "One-off" is how a group filter is cleared.
 *
 * @param props - Component props.
 * @returns The filter row.
 */
export function ScopeFilter({
  scope,
  onScopeChange,
  groups,
}: {
  /** The active filter: "all", "oneoff", or a group id. */
  scope: ExpenseScopeFilter;
  /** Called with the newly picked filter. */
  onScopeChange: (scope: ExpenseScopeFilter) => void;
  /** The user's groups, in the order to list them. */
  groups: { id: string; name: string }[];
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const groupPicked = isGroupScope(scope);
  const pickedGroup = groups.find((group) => group.id === scope);
  const matches = scopePickerGroups(groups, query);

  /** Closes the list, clearing the search so the next open starts from every group. */
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  // Escape closes, and so does a touch outside: an open list that survives a
  // tap on the page would sit over the very rows it was opened to filter.
  // `pointerdown` rather than `mousedown`, which iOS only synthesizes for
  // taps that land on something clickable.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen, close]);

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1.5">
      {FIXED_SCOPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={scope === option.value}
          onClick={() => {
            close();
            onScopeChange(option.value);
          }}
          className={`${SCOPE_CHIP_CLASS} ${
            scope === option.value ? SCOPE_CHIP_ACTIVE_CLASS : SCOPE_CHIP_IDLE_CLASS
          }`}
        >
          {option.label}
        </button>
      ))}
      {groups.length > 0 ? (
        <button
          type="button"
          onClick={() => (isOpen ? close() : setIsOpen(true))}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-label={
            pickedGroup ? `Showing ${pickedGroup.name}. Change group` : "Filter by group"
          }
          className={`flex min-w-0 items-center gap-1 ${SCOPE_CHIP_CLASS} ${
            groupPicked ? SCOPE_CHIP_ACTIVE_CLASS : SCOPE_CHIP_IDLE_CLASS
          }`}
        >
          {/* Narrower on the smallest phones, so a long group name still
              leaves the three controls on one line. */}
          <span className="max-w-32 truncate min-[360px]:max-w-44">
            {pickedGroup?.name ?? GROUP_SCOPE_LABEL}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}
      {isOpen ? (
        // Full width on a phone, where the button sits mid-row and a list
        // hung from it would run off the screen; a fixed width from `sm:` up.
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-card shadow-lg shadow-ink/10 sm:right-auto sm:w-80">
          {groups.length > SCOPE_PICKER_SEARCH_THRESHOLD ? (
            <div className="p-2">
              <SearchField value={query} onChange={setQuery} placeholder="Search groups" />
            </div>
          ) : null}
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-soft">No group matches that.</p>
          ) : (
            // Capped at six and a half rows, so a longer list is cut mid-row
            // and visibly has more behind it.
            <ul
              id={listId}
              role="listbox"
              aria-label="Filter by group"
              className="max-h-[17.875rem] overflow-y-auto py-1"
            >
              {matches.map((group) => {
                const selected = group.id === scope;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onScopeChange(group.id);
                        close();
                      }}
                      className={`flex h-11 w-full items-center gap-2 px-3 text-left text-sm ${
                        selected
                          ? "bg-brand-50 font-semibold text-brand-700"
                          : "font-medium text-ink hover:bg-paper"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <Check
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-brand-600 ${selected ? "" : "invisible"}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
