"use client";
/** Item cards: one card per line item with people chips, a claim mode, per-item portions, and a running per-person summary. */

import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { percentOfItems } from "@/lib/expense/splitForm";
import { Avatar } from "@/components/ui/Avatar";
import {
  MAX_ASSIGNEE_WEIGHT,
  MAX_ITEM_QUANTITY,
  TIP_PERCENT_PRESETS,
} from "./itemCards.constants";

/** One editable line item, however the owning form stores the rest of its draft. */
export interface CardItem {
  /** Stable client-side key (items have no server id until saved). */
  key: string;
  /** Item name. */
  name: string;
  /** Raw money input for the line total, e.g. "14.50". */
  total: string;
  /** How many were bought; only the receipt scanner sets it, and it never scales `total`. */
  quantity?: number;
  /** Portion count per user id; absent or 0 means "not on this item". */
  assignees: Record<string, number>;
}

/**
 * Shared input styling for the cards' text fields.
 *
 * `text-base` on phones is not a size preference: iOS Safari zooms the whole
 * page when a focused input's font is under 16px. It drops to `text-sm` from
 * `sm:` up, where no such rule applies.
 */
const fieldClass =
  "h-10 min-w-0 rounded-lg border border-line bg-paper px-3 text-base focus:border-brand-500 focus:outline-none sm:h-9 sm:text-sm";

/**
 * A person's name as a chip shows it: "You" for the signed-in user, otherwise
 * the first name. The full name stays in the accessible label.
 *
 * @param person - The person to label.
 * @param currentUserId - Id of the signed-in user.
 * @returns The short display name.
 */
function shortName(person: User, currentUserId: string): string {
  if (person.id === currentUserId) return "You";
  return person.name.split(/\s+/)[0] || person.name;
}

/**
 * A person's name for accessible labels and claim-mode copy.
 *
 * @param person - The person to label.
 * @param currentUserId - Id of the signed-in user.
 * @returns "You" for the signed-in user, otherwise the full name.
 */
function fullName(person: User, currentUserId: string): string {
  return person.id === currentUserId ? "You" : person.name;
}

/**
 * Renders line items as cards: name and amount on the first line, then one
 * chip per person to toggle who had it. Nothing scrolls sideways at any
 * width, which is what the previous items-by-people table could not manage
 * on a phone.
 *
 * Two things make a long receipt fast. **Claim mode**: pick a person in the
 * bar at the top and every card becomes a tap target for them, the way a
 * table actually settles up, one person at a time; the chips stay put, so
 * the keyboard path is the same as ever. **Portions per
 * card**: most lines are on/off; the rare "two chais against one" opens a
 * stepper on that card alone instead of turning every cell into a number
 * box. The quantity the scanner read is shown after the name and edited in
 * the same panel, since a mis-read count is one of the things people fix.
 *
 * The running per-person totals live in the owning form's SplitSummary,
 * which every split mode shares, so the cards carry only their own notes.
 *
 * @param props - Component props.
 * @returns The cards, the tax and tip rows, and the summary strip.
 */
export function ItemCards({
  items,
  people,
  currentUserId,
  currency,
  showQuantity = false,
  taxInput,
  tipInput,
  itemsTotalCents,
  onUpdateItem,
  onSetWeight,
  onSetAssignees,
  onRemoveItem,
  onAddItem,
  onTaxChange,
  onTipChange,
  onApplyTipPercent,
}: {
  /** The line items to render, in order. */
  items: CardItem[];
  /** Everyone who can be on an item; becomes one chip each. */
  people: User[];
  /** Id of the signed-in user, whose chip is labelled "You". */
  currentUserId: string;
  /** ISO 4217 code used to format money. */
  currency: string;
  /** Whether quantities are shown and editable (the scanner reads them off the receipt). */
  showQuantity?: boolean;
  /** Raw tax money input. */
  taxInput: string;
  /** Raw tip money input. */
  tipInput: string;
  /** The items subtotal in cents, the base the tax and tip percentages read against. */
  itemsTotalCents: number;
  /** Applies a partial update to the item at `index`. */
  onUpdateItem: (index: number, patch: Partial<CardItem>) => void;
  /** Sets one person's portion count on the item at `index`; 0 removes them. */
  onSetWeight: (index: number, userId: string, weight: number) => void;
  /** Replaces the whole assignee map of the item at `index` (the Everyone chip). */
  onSetAssignees: (index: number, assignees: Record<string, number>) => void;
  /** Removes the item at `index`. */
  onRemoveItem: (index: number) => void;
  /** Appends a blank item. */
  onAddItem: () => void;
  /** Called with the raw tax input on every keystroke. */
  onTaxChange: (value: string) => void;
  /** Called with the raw tip input on every keystroke. */
  onTipChange: (value: string) => void;
  /** Sets the tip to a percentage of the items subtotal. */
  onApplyTipPercent: (percent: number) => void;
}) {
  const fieldId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Set when Enter in an amount box adds a line, so the new name gets focus
  // once it exists; cleared as soon as it has been used.
  const focusLastAdded = useRef(false);

  const claimer = people.find((person) => person.id === claimingId) ?? null;

  useEffect(() => {
    if (!focusLastAdded.current) return;
    focusLastAdded.current = false;
    const inputs =
      listRef.current?.querySelectorAll<HTMLInputElement>("[data-item-name]");
    inputs?.[inputs.length - 1]?.focus();
  }, [items]);


  const taxCents = parseMoneyInput(taxInput, currency) ?? 0;
  const tipCents = parseMoneyInput(tipInput, currency) ?? 0;
  const taxPercent = percentOfItems(taxCents, itemsTotalCents);
  const tipPercent = percentOfItems(tipCents, itemsTotalCents);

  return (
    <div className="space-y-3">
      {/* Claim bar. Sticky within the page's scroller so the active person
          stays in view while you work down a long receipt. */}
      {people.length > 0 ? (
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
            <span className="shrink-0 tabular-nums">
              {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
              {people.length} people
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {people.map((person) => {
              const active = claimingId === person.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setClaimingId(active ? null : person.id)}
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
                onClick={() => setClaimingId(null)}
                className="ml-auto h-9 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700"
              >
                Done
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul ref={listRef} className="space-y-2.5">
        {items.map((item, index) => {
          const cents = parseMoneyInput(item.total, currency);
          const hasAmount = cents !== null && cents > 0;
          const onItem = people.filter(
            (person) => (item.assignees[person.id] ?? 0) > 0,
          );
          const everyoneOn =
            people.length > 0 && onItem.length === people.length;
          const unassigned = onItem.length === 0;
          const sumWeights = onItem.reduce(
            (runningTotal, person) => runningTotal + item.assignees[person.id],
            0,
          );
          const quantity = item.quantity ?? 1;
          const claimerOn = claimer
            ? (item.assignees[claimer.id] ?? 0) > 0
            : false;
          const expanded = expandedKey === item.key;
          const note = !hasAmount
            ? "Needs an amount"
            : unassigned
              ? "Nobody's on this yet"
              : "";
          return (
            <li key={item.key}>
              <article
                // In claim mode the whole card is the target; the inputs and
                // chips inside keep their own behaviour. Pointer convenience
                // only: the chips remain the keyboard path, so no role is
                // claimed here.
                onClick={
                  claimer
                    ? (event) => {
                        if (
                          (event.target as HTMLElement).closest("input, button")
                        )
                          return;
                        onSetWeight(index, claimer.id, claimerOn ? 0 : 1);
                      }
                    : undefined
                }
                className={`relative space-y-2.5 rounded-2xl border p-3 transition-[border-color,box-shadow] ${
                  hasAmount && unassigned
                    ? "border-neg-600/20 bg-neg-50"
                    : "border-line bg-card"
                } ${
                  claimer
                    ? claimerOn
                      ? "cursor-pointer border-brand-500 ring-3 ring-brand-100"
                      : "cursor-pointer border-dashed"
                    : ""
                }`}
              >
                {claimer && claimerOn ? (
                  <span className="absolute -top-2.5 right-3 inline-flex h-5 items-center gap-1 rounded-full bg-brand-600 px-2 text-[11px] font-bold text-white">
                    <Check className="h-3 w-3" />{" "}
                    {fullName(claimer, currentUserId)}
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      data-item-name={item.key}
                      placeholder="Item name"
                      aria-label={`Name for item ${index + 1}${
                        quantity > 1 ? `, quantity ${quantity}` : ""
                      }`}
                      maxLength={MAX_EXPENSE_ITEM_NAME_LENGTH}
                      value={item.name}
                      onChange={(event) =>
                        onUpdateItem(index, { name: event.target.value })
                      }
                      className={`${fieldClass} w-full ${quantity > 1 ? "pr-12" : ""}`}
                    />
                    {/* The count reads as part of the line, the way a receipt
                        prints it, never as a control. */}
                    {quantity > 1 ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-soft tabular-nums"
                      >
                        ×{quantity}
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Amount for item ${index + 1}`}
                    value={item.total}
                    onChange={(event) =>
                      onUpdateItem(index, { total: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      focusLastAdded.current = true;
                      onAddItem();
                    }}
                    className={`${fieldClass} w-24 text-right tabular-nums`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    aria-label={`Remove item ${index + 1}`}
                    title="Remove item"
                    className="rounded-lg p-2 text-ink-soft hover:bg-paper hover:text-neg-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {people.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSetAssignees(
                          index,
                          everyoneOn
                            ? {}
                            : Object.fromEntries(
                                people.map((person) => [person.id, 1]),
                              ),
                        )
                      }
                      aria-pressed={everyoneOn}
                      className={`h-8 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                        everyoneOn
                          ? "border-ink bg-ink text-card"
                          : "border-line bg-paper text-ink-soft hover:border-brand-300"
                      }`}
                    >
                      Everyone
                    </button>
                  ) : null}
                  {people.map((person) => {
                    const weight = item.assignees[person.id] ?? 0;
                    const isOn = weight > 0;
                    // A lit chip takes the person's own avatar colour, so a
                    // fully assigned card reads as four people, not four
                    // alarms, and the same colour carries into the summary.
                    const tint = person.avatarColor || "#b03a25";
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() =>
                          onSetWeight(index, person.id, isOn ? 0 : 1)
                        }
                        aria-pressed={isOn}
                        aria-label={`${isOn ? "Remove" : "Add"} ${fullName(person, currentUserId)} ${
                          isOn ? "from" : "to"
                        } item ${index + 1}`}
                        style={
                          isOn
                            ? {
                                borderColor: tint,
                                backgroundColor: `${tint}1f`,
                              }
                            : undefined
                        }
                        className={`flex h-8 items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-[13px] transition-colors ${
                          isOn
                            ? "font-semibold text-ink"
                            : "border-line bg-paper font-medium text-ink-soft hover:border-brand-300"
                        }`}
                      >
                        <span className={isOn ? "" : "opacity-50"}>
                          <Avatar user={person} size="xsmall" />
                        </span>
                        {shortName(person, currentUserId)}
                        {weight > 1 ? (
                          <span className="text-[11px] text-brand-700 tabular-nums">
                            {weight} portions
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : item.key)}
                    aria-expanded={expanded}
                    className={`ml-auto h-8 rounded-full border px-2.5 text-xs transition-colors ${
                      expanded
                        ? "border-brand-200 text-brand-700"
                        : "border-dashed border-line text-ink-soft hover:border-brand-200 hover:text-brand-700"
                    }`}
                  >
                    Portions
                  </button>
                </div>

                {expanded ? (
                  <div className="space-y-2 rounded-xl border border-line bg-paper p-2.5 text-sm">
                    {showQuantity ? (
                      <div className="flex items-center gap-2 border-b border-dashed border-line pb-2">
                        <span className="flex-1 font-medium">
                          Quantity on the receipt
                        </span>
                        <Stepper
                          value={quantity}
                          min={1}
                          max={MAX_ITEM_QUANTITY}
                          label="on the receipt"
                          onChange={(next) =>
                            onUpdateItem(index, { quantity: next })
                          }
                        />
                      </div>
                    ) : null}
                    <p className="text-xs text-ink-soft">
                      {onItem.length > 0
                        ? "How many portions each person had of this line"
                        : "Add people with the chips above to split portions"}
                    </p>
                    {onItem.map((person) => {
                      const weight = item.assignees[person.id];
                      const each =
                        cents !== null && sumWeights > 0
                          ? formatMoney(
                              Math.round((cents * weight) / sumWeights),
                              currency,
                            )
                          : "";
                      return (
                        <div
                          key={person.id}
                          className="flex items-center gap-2"
                        >
                          <Avatar user={person} size="xsmall" />
                          <span className="flex-1 truncate font-medium">
                            {fullName(person, currentUserId)}
                          </span>
                          <Stepper
                            value={weight}
                            min={0}
                            max={MAX_ASSIGNEE_WEIGHT}
                            label={`for ${fullName(person, currentUserId)}`}
                            onChange={(next) =>
                              onSetWeight(index, person.id, next)
                            }
                          />
                          <span className="w-16 text-right text-xs text-ink-soft tabular-nums">
                            {each}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {note ? (
                  <p className="text-xs font-semibold text-neg-700">{note}</p>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onAddItem}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line text-sm font-semibold text-ink-soft hover:border-brand-500 hover:text-brand-700"
      >
        <Plus className="h-4 w-4" /> Add item
      </button>

      <div className="space-y-2 rounded-2xl border border-line bg-card p-3">
        <div className="grid grid-cols-[2.75rem_6rem_minmax(0,1fr)] items-center gap-2.5">
          <label htmlFor={`${fieldId}-tax`} className="text-sm text-ink-soft">
            Tax
          </label>
          <input
            id={`${fieldId}-tax`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={taxInput}
            onChange={(event) => onTaxChange(event.target.value)}
            className={`${fieldClass} w-full text-right tabular-nums`}
          />
          <span className="text-xs text-ink-soft">
            {taxPercent ? (
              <span className="mr-1.5 font-semibold text-ink tabular-nums">
                {taxPercent} of items
              </span>
            ) : null}
            split in proportion to each person&apos;s items
          </span>
        </div>
        <div className="grid grid-cols-[2.75rem_6rem_minmax(0,1fr)] items-center gap-2.5">
          <label htmlFor={`${fieldId}-tip`} className="text-sm text-ink-soft">
            Tip
          </label>
          <input
            id={`${fieldId}-tip`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={tipInput}
            onChange={(event) => onTipChange(event.target.value)}
            className={`${fieldClass} w-full text-right tabular-nums`}
          />
          <span className="flex flex-wrap items-center gap-1.5">
            {TIP_PERCENT_PRESETS.map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => onApplyTipPercent(percent)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-brand-500 hover:text-brand-700 sm:py-0.5"
              >
                {percent}%
              </button>
            ))}
            {tipPercent ? (
              <span className="text-xs font-semibold text-ink tabular-nums">
                {tipPercent} of items
              </span>
            ) : null}
          </span>
        </div>
      </div>

    </div>
  );
}

/**
 * A minus / count / plus control for small integers.
 *
 * @param props - Component props.
 * @returns The stepper.
 */
function Stepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  /** The current count. */
  value: number;
  /** Lowest count the minus button may reach. */
  min: number;
  /** Highest count the plus button may reach. */
  max: number;
  /** Suffix for the buttons' accessible labels, e.g. "for Adnan". */
  label: string;
  /** Called with the new count. */
  onChange: (next: number) => void;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-card">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label={`One fewer ${label}`}
        className="h-8 w-8 text-base leading-none hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
      >
        −
      </button>
      <output className="min-w-7 text-center text-sm font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`One more ${label}`}
        className="h-8 w-8 text-base leading-none hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
      >
        +
      </button>
    </span>
  );
}
