"use client";
/** Claim bar for the item cards: pick whose items are being checked off, as a one-row expandable list on a phone and a row of chips on wider screens. */

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { Avatar } from "@/components/ui/Avatar";
import { fullName, shortName } from "../../utils/personLabels";

/**
 * Words how many items a person is on, for the picker's rows.
 *
 * @param count - The number of items.
 * @returns "No items", "1 item" or "N items".
 */
function itemCountLabel(count: number): string {
  if (count === 0) return "No items";
  return `${count} item${count === 1 ? "" : "s"}`;
}

/**
 * Renders the bar that says whose items are being checked off. It sticks to
 * the top of the page's scroller, so the active person stays in view while
 * you work down a long receipt.
 *
 * Two layouts of one choice. `chips` is a chip per person, which a wide
 * screen has room for. `list` is for a phone, where twelve chips wrap into
 * four rows and the sticky bar eats a third of the screen: one row showing
 * who is picked, opening into a list of everyone with the number of items
 * each is on. The list floats over the cards rather than pushing them down,
 * so nothing under your thumb moves when it opens or closes.
 *
 * @param props - Component props.
 * @returns The sticky claim bar.
 */
export function ClaimBar({
  layout,
  people,
  claimer,
  currentUserId,
  itemCount,
  claimedCounts,
  onClaim,
}: {
  /** `list` for the phone's expandable list, `chips` for the row of chips. */
  layout: "list" | "chips";
  /** Everyone who can be claimed for, in display order. */
  people: User[];
  /** The person whose items are being checked off, or null when claiming is off. */
  claimer: User | null;
  /** Id of the signed-in user, who is labelled "You". */
  currentUserId: string;
  /** How many line items there are. */
  itemCount: number;
  /** How many items each person is on, keyed by user id; absent means none. */
  claimedCounts: Record<string, number>;
  /** Called with the person to claim for, or null to turn claiming off. */
  onClaim: (userId: string | null) => void;
}) {
  const listId = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  // A list left open when the screen widens has nothing to show.
  const listOpen = isOpen && layout === "list";

  // Escape closes, and so does a touch outside: an open list that survives a
  // tap on a card would sit over the very items the pick was for.
  // `pointerdown` rather than `mousedown`, which iOS only synthesizes for
  // taps that land on something clickable.
  useEffect(() => {
    if (!listOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [listOpen]);

  const totals = (
    <span className="shrink-0 tabular-nums">
      {itemCount} item{itemCount === 1 ? "" : "s"} · {people.length} people
    </span>
  );

  if (layout === "list") {
    return (
      // Raised while the list is open: the summary strip at the bottom of the
      // form shares this bar's layer and would otherwise paint over the list.
      <div
        className={`sticky top-0 -mx-1 rounded-xl bg-paper/95 px-1 py-2 backdrop-blur-sm ${
          listOpen ? "z-20" : "z-10"
        }`}
      >
        <p className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-soft">
          <span>Check the items for</span>
          {totals}
        </p>
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-label={
              claimer
                ? `Checking items for ${fullName(claimer, currentUserId)}. Change person`
                : "Pick whose items to check"
            }
            className={`flex h-11 w-full items-center gap-2 rounded-xl border bg-card pr-3 pl-2 text-left text-sm transition-colors ${
              listOpen ? "border-brand-500" : "border-line"
            }`}
          >
            {claimer ? <Avatar user={claimer} size="sm" /> : null}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {claimer ? fullName(claimer, currentUserId) : "Pick a person"}
            </span>
            {claimer ? (
              <span className="shrink-0 text-xs text-ink-soft tabular-nums">
                {itemCountLabel(claimedCounts[claimer.id] ?? 0)}
              </span>
            ) : null}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${
                listOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {listOpen ? (
            // Capped at seven and a half rows, so a longer list is cut
            // mid-row and visibly has more behind it.
            <ul
              id={listId}
              aria-label="Whose items to check"
              className="absolute inset-x-0 top-full mt-1 max-h-[min(50dvh,20.5rem)] overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-lg shadow-ink/10"
            >
              {people.map((person) => {
                const active = claimer?.id === person.id;
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClaim(person.id);
                        setIsOpen(false);
                      }}
                      aria-pressed={active}
                      className={`flex h-11 w-full items-center gap-2.5 px-2.5 text-left text-sm ${
                        active ? "bg-brand-50 font-semibold text-brand-700" : "font-medium text-ink"
                      }`}
                    >
                      <Avatar user={person} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {fullName(person, currentUserId)}
                      </span>
                      <span className="shrink-0 text-xs font-normal text-ink-soft tabular-nums">
                        {itemCountLabel(claimedCounts[person.id] ?? 0)}
                      </span>
                      <Check
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-brand-600 ${active ? "" : "invisible"}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-xl bg-paper/95 px-1 py-2 backdrop-blur-sm">
      <p className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-soft">
        <span>
          {claimer ? (
            <>
              Tap the items{" "}
              <strong className="font-semibold text-brand-700">
                {fullName(claimer, currentUserId)}
              </strong>{" "}
              had
            </>
          ) : (
            "Who had what? Tap a person, then their items."
          )}
        </span>
        {totals}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {people.map((person) => {
          const active = claimer?.id === person.id;
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => onClaim(active ? null : person.id)}
              aria-pressed={active}
              className={`flex h-9 items-center gap-1.5 rounded-full border pr-3 pl-1 text-sm font-semibold transition-colors ${
                active
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line bg-card text-ink hover:border-brand-300"
              }`}
            >
              <Avatar user={person} size="sm" />
              {shortName(person, currentUserId)}
            </button>
          );
        })}
        {claimer ? (
          <button
            type="button"
            onClick={() => onClaim(null)}
            className="ml-auto h-9 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700"
          >
            Done
          </button>
        ) : null}
      </div>
    </div>
  );
}
