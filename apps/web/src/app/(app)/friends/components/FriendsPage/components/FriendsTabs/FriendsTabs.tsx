"use client";
/** Segmented tab strip for the friends page, with a count on every view that has something in it. */

import { FRIENDS_TABS, type FriendsTab } from "../../../../constants/friendsTabs";

/**
 * Renders the four-way switch between the friends page's views. Styled like
 * the expense form's split-type tabs so the two read as the same control.
 * Incoming requests get a brand-coloured count because they are the one view
 * that wants an answer; the others get a quiet one.
 *
 * @param props - Component props.
 * @returns The tab strip.
 */
export function FriendsTabs({
  tab,
  counts,
  onChange,
}: {
  /** The selected view. */
  tab: FriendsTab;
  /** How many rows each view holds; zero hides that view's count. */
  counts: Record<FriendsTab, number>;
  /** Called with the view the user picked. */
  onChange: (tab: FriendsTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Friends views"
      className="grid grid-cols-4 rounded-xl bg-paper p-1 text-xs font-semibold ring-1 ring-line sm:text-sm"
    >
      {FRIENDS_TABS.map((option) => {
        const selected = tab === option.value;
        const count = counts[option.value];
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`friends-tab-${option.value}`}
            aria-selected={selected}
            aria-controls={`friends-panel-${option.value}`}
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 transition-colors sm:py-2 ${
              selected ? "bg-card text-brand-700 shadow-sm" : "text-ink-soft"
            }`}
          >
            <span className="sm:hidden">{option.shortLabel}</span>
            <span className="hidden sm:inline">{option.label}</span>
            {count > 0 ? (
              <span
                className={`rounded-full px-1.5 text-[10px] leading-4 tabular-nums ${
                  option.value === "requests" ? "bg-brand-600 text-white" : "bg-line text-ink-soft"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
