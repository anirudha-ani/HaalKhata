"use client";
/** Item cards: one card per line item with people chips, a claim mode, per-item portions, and a running per-person summary. */

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { User } from "@haalkhata/protogen/common/v1/common_pb";
import { formatMoney, parseMoneyInput } from "@haalkhata/shared/money/money";
import { MAX_EXPENSE_ITEM_NAME_LENGTH } from "@haalkhata/shared/text/limits";
import { countClaimedItems, resolveClaimer } from "@/lib/expense/claiming";
import { percentOfItems } from "@/lib/expense/splitForm";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { ClaimBar } from "./components/ClaimBar/ClaimBar";
import { Stepper } from "./components/Stepper/Stepper";
import {
  MAX_ASSIGNEE_WEIGHT,
  MAX_ITEM_QUANTITY,
  PHONE_LAYOUT_MEDIA_QUERY,
  TIP_PERCENT_PRESETS,
  fieldClass,
} from "./constants/itemCards";
import { fullName, shortName } from "./utils/personLabels";

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
 * Renders line items as cards: name and amount on the first line, then one
 * chip per person to toggle who had it. Nothing scrolls sideways at any
 * width, which is what the previous items-by-people table could not manage
 * on a phone.
 *
 * Two things make a long receipt fast. **Claim mode**: pick a person in the
 * bar at the top and every card grows a checkbox for them, the way a table
 * actually settles up, one person at a time. The rest of the card toggles
 * them too, but a card full of chips leaves little bare card to hit, so the
 * checkbox is the target that is always there. A phone starts with the
 * signed-in user picked, because claiming is the one way through a long bill
 * on a small screen; a wider screen leaves it off until asked for. The chips
 * stay put either way. **Portions per
 * card**: most lines are on/off; the rare "two chais against one" opens a
 * stepper on that card alone instead of turning every cell into a number
 * box. The same panel holds the line's quantity, shown after the name once
 * it is above one: for a scanned bill that is the count the scanner read,
 * and a mis-read count is one of the things people fix.
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
  scanned = false,
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
  /** Whether the draft came off a receipt photo, which changes how the quantity row is worded. */
  scanned?: boolean;
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

  const isPhone = useMediaQuery(PHONE_LAYOUT_MEDIA_QUERY);
  const claimer = resolveClaimer(people, claimingId, currentUserId, isPhone);

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
      {people.length > 0 ? (
        <ClaimBar
          layout={isPhone ? "list" : "chips"}
          people={people}
          claimer={claimer}
          currentUserId={currentUserId}
          itemCount={items.length}
          claimedCounts={countClaimedItems(items)}
          onClaim={setClaimingId}
        />
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
                // In claim mode the bare card toggles the claimer as well as
                // its checkbox; the inputs and chips inside keep their own
                // behaviour. Pointer convenience only: the checkbox is the
                // real control, so no role is claimed here. The label is
                // skipped along with the controls because a click on it is
                // replayed on its checkbox, and counting both would toggle
                // twice.
                onClick={
                  claimer
                    ? (event) => {
                        if (
                          (event.target as HTMLElement).closest(
                            "input, button, label",
                          )
                        )
                          return;
                        onSetWeight(index, claimer.id, claimerOn ? 0 : 1);
                      }
                    : undefined
                }
                className={`space-y-2.5 rounded-2xl border p-3 transition-[border-color,box-shadow] ${
                  hasAmount && unassigned
                    ? "border-neg-600/20 bg-neg-50"
                    : "border-line bg-card"
                } ${
                  claimer
                    ? claimerOn
                      ? "cursor-pointer border-brand-500 ring-3 ring-brand-100"
                      : "cursor-pointer"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* The label is the tap target, a good deal larger than
                      the box it wraps; its negative margins hand most of
                      that back to the name beside it. */}
                  {claimer ? (
                    <label className="-mr-1 -ml-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center sm:h-9 sm:w-9">
                      <input
                        type="checkbox"
                        checked={claimerOn}
                        onChange={() =>
                          onSetWeight(index, claimer.id, claimerOn ? 0 : 1)
                        }
                        aria-label={`${fullName(claimer, currentUserId)} had item ${index + 1}`}
                        className="h-6 w-6 cursor-pointer accent-brand-600"
                      />
                    </label>
                  ) : null}
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
                    <div className="flex items-center gap-2 border-b border-dashed border-line pb-2">
                      <span className="flex-1 font-medium">
                        {scanned ? "Quantity on the receipt" : "Quantity"}
                      </span>
                      <Stepper
                        value={quantity}
                        min={1}
                        max={MAX_ITEM_QUANTITY}
                        label={scanned ? "on the receipt" : "of this item"}
                        onChange={(next) => onUpdateItem(index, { quantity: next })}
                      />
                    </div>
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
