"use client";
/** Who-owes-what for an expense split: a strip that hugs the bottom on phones, a panel with bars on desktop. */

import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { formatMoney } from "@haalkhata/shared/money/money";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Renders what each person owes under the current split, the expense total,
 * and whatever still stops it adding up. Two layouts of one set of numbers:
 * the `strip` sticks to the bottom of the scroller beside the item cards on a
 * phone, where every row of height is contested; the `panel` sits in the
 * form's sidebar on desktop, where there is room for names and a bar per
 * person showing their slice of the total. Any split mode feeds it; an
 * itemized one adds the items, tax and tip breakdown.
 *
 * @param props - Component props.
 * @returns The summary in the requested layout.
 */
export function SplitSummary({
  layout,
  people,
  currentUserId,
  currency,
  shares,
  totalCents,
  breakdown,
  warnings,
  ready,
  readyMessage,
  className = "",
}: {
  /** `strip` for the sticky phone strip, `panel` for the desktop sidebar. */
  layout: "strip" | "panel";
  /** Everyone on the expense, in display order. */
  people: User[];
  /** Id of the signed-in user, shown as "You". */
  currentUserId: string;
  /** ISO 4217 code used to format money. */
  currency: string;
  /** What each person currently owes, keyed by user id, in cents. */
  shares: Record<string, number>;
  /** The expense total, in cents. */
  totalCents: number;
  /** Itemized only: the subtotal, tax and tip that make up the total. */
  breakdown?: { itemsTotalCents: number; taxCents: number; tipCents: number };
  /** Sentences about what still stops the split adding up; empty when it does. */
  warnings: string[];
  /** Whether there is enough of a draft to reassure about; a blank form has nothing to say. */
  ready: boolean;
  /** What to say when there are no warnings and the draft is ready, e.g. "Everything is assigned". */
  readyMessage: string;
  /** Extra classes for the outer element, e.g. to hide one layout at a breakpoint. */
  className?: string;
}) {
  const label = (person: User) => (person.id === currentUserId ? "You" : person.name);
  const status =
    warnings.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {warnings.map((warning) => (
          <span
            key={warning}
            className="rounded-full bg-neg-50 px-2.5 py-0.5 text-xs font-semibold text-neg-700"
          >
            {warning}
          </span>
        ))}
      </div>
    ) : ready ? (
      <p className="text-xs font-semibold text-pos-700">{readyMessage}</p>
    ) : null;

  if (layout === "strip") {
    return (
      <div
        className={`sticky bottom-2 z-10 space-y-1.5 rounded-2xl border border-line bg-card p-3 shadow-lg shadow-ink/10 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {people.map((person) => (
              <span
                key={person.id}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper pr-2.5 pl-0.5 text-xs font-semibold tabular-nums"
              >
                <Avatar user={person} size="xsmall" />
                <span className="hidden sm:inline">{label(person).split(/\s+/)[0]}</span>
                {formatMoney(shares[person.id] ?? 0, currency)}
              </span>
            ))}
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
              Total
            </span>
            <span className="font-display text-lg font-bold tabular-nums">
              {formatMoney(totalCents, currency)}
            </span>
          </div>
        </div>
        {status}
      </div>
    );
  }

  return (
    <aside
      aria-label="Who owes what"
      className={`space-y-4 rounded-2xl border border-line bg-card p-5 ${className}`}
    >
      <div>
        <span className="block text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
          Total
        </span>
        <span className="font-display text-3xl font-bold tabular-nums">
          {formatMoney(totalCents, currency)}
        </span>
      </div>
      <ul className="space-y-3">
        {people.map((person) => {
          const share = shares[person.id] ?? 0;
          const width = totalCents > 0 ? Math.round((share / totalCents) * 100) : 0;
          return (
            <li
              key={person.id}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5"
            >
              <Avatar user={person} size="sm" />
              <span className="truncate text-sm font-semibold">{label(person)}</span>
              <span className="font-semibold tabular-nums">{formatMoney(share, currency)}</span>
              <span className="col-span-2 col-start-2 h-1 overflow-hidden rounded-full bg-paper">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${width}%`, backgroundColor: person.avatarColor }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {breakdown ? (
        <dl className="space-y-1.5 border-t border-line pt-3 text-xs text-ink-soft">
          {[
            ["Items", breakdown.itemsTotalCents],
            ["Tax", breakdown.taxCents],
            ["Tip", breakdown.tipCents],
          ].map(([name, cents]) => (
            <div key={name} className="flex justify-between tabular-nums">
              <dt>{name}</dt>
              <dd>{formatMoney(Number(cents), currency)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {status}
    </aside>
  );
}
