/** Editable itemized-draft state for the expense form's Items split, typed or read off a receipt. */

import { useState } from "react";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";
import { centsToInput } from "@haalkhata/shared/money/money";
import {
  draftCompleteness,
  draftTotals,
  itemizedWarnings,
  previewItemizedShares,
  unassignedCount,
  type DraftItem,
} from "@/lib/expense/itemDraft";

/**
 * Holds a draft's line items with their portion counts, plus the tax and tip
 * inputs, and exposes the editing moves the cards need: correct a line, tap
 * people onto it, set portions, put everyone on or off it, add or remove
 * lines, and drop a person who left the expense.
 *
 * @param initial - Starting lines (null while a receipt has not been parsed
 *   yet), and the raw tax and tip inputs.
 * @param currency - ISO 4217 code the amounts are typed in.
 * @returns The draft state, its editing helpers, and the derived totals,
 *   per-person preview, warnings, unassigned count, and completeness check.
 */
export function useItemDraft(
  initial: { items: DraftItem[] | null; tax: string; tip: string },
  currency: string,
) {
  const [items, setItems] = useState<DraftItem[] | null>(initial.items);
  const [taxInput, setTaxInput] = useState(initial.tax);
  const [tipInput, setTipInput] = useState(initial.tip);

  /**
   * Applies a change to every current line.
   *
   * @param change - Maps each existing item to its replacement.
   */
  const mapItems = (change: (item: DraftItem, index: number) => DraftItem) => {
    setItems((current) => (current ? current.map(change) : current));
  };

  /**
   * Sets one person's portion count on one line; 0 takes them off it.
   *
   * @param index - Position of the line in the draft.
   * @param userId - Whose count is changing.
   * @param weight - The new count.
   */
  const setWeight = (index: number, userId: string, weight: number) => {
    mapItems((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const assignees = { ...item.assignees };
      if (weight > 0) assignees[userId] = weight;
      else delete assignees[userId];
      return { ...item, assignees };
    });
  };

  const totals = draftTotals(items ?? [], taxInput, tipInput, currency);

  return {
    items,
    /**
     * Replaces the whole draft, e.g. with a freshly parsed receipt.
     *
     * @param nextItems - The new lines, or null to clear the draft.
     * @param nextTax - Raw tax input to start from.
     * @param nextTip - Raw tip input to start from.
     */
    replace: (nextItems: DraftItem[] | null, nextTax: string, nextTip: string) => {
      setItems(nextItems);
      setTaxInput(nextTax);
      setTipInput(nextTip);
    },
    /**
     * Applies a partial update to one line.
     *
     * @param index - Position of the line in the draft.
     * @param patch - Fields to merge into that line.
     */
    updateItem: (index: number, patch: Partial<DraftItem>) => {
      mapItems((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    },
    /**
     * Toggles whether a person shares a line, at a single portion.
     *
     * @param index - Position of the line in the draft.
     * @param userId - Id of the person to toggle on that line.
     */
    toggleAssignee: (index: number, userId: string) => {
      const current = items?.[index]?.assignees[userId] ?? 0;
      setWeight(index, userId, current > 0 ? 0 : 1);
    },
    setWeight,
    /**
     * Replaces the whole assignee map of one line. The Everyone chip puts the
     * entire cast on (or off) a line in one update.
     *
     * @param index - Position of the line in the draft.
     * @param assignees - New portion counts by user id; an empty map leaves the line unassigned.
     */
    setAssignees: (index: number, assignees: Record<string, number>) => {
      mapItems((item, itemIndex) => (itemIndex === index ? { ...item, assignees } : item));
    },
    /**
     * Puts a person on every line at a single portion, leaving other people's
     * counts alone.
     *
     * @param userId - Id of the person to add everywhere.
     */
    assignAllTo: (userId: string) => {
      mapItems((item) => ({
        ...item,
        assignees: { ...item.assignees, [userId]: item.assignees[userId] || 1 },
      }));
    },
    /**
     * Removes one line.
     *
     * @param index - Position of the line to remove.
     */
    removeItem: (index: number) => {
      setItems((current) =>
        current ? current.filter((_item, itemIndex) => itemIndex !== index) : current,
      );
    },
    /** Appends a blank line. */
    addItem: () => {
      setItems((current) => [
        ...(current ?? []),
        { key: nextDraftKey(), name: "", quantity: 1, total: "", assignees: {} },
      ]);
    },
    /**
     * Forgets a person who left the expense, so no line can still name them.
     *
     * @param userId - Id of the person no longer on the expense.
     */
    dropAssignee: (userId: string) => {
      mapItems((item) => {
        const { [userId]: _dropped, ...assignees } = item.assignees;
        return { ...item, assignees };
      });
    },
    /** Clears every assignment, e.g. when the cast is replaced by a group's roster. */
    clearAssignees: () => {
      mapItems((item) => ({ ...item, assignees: {} }));
    },
    /**
     * Re-shares every line across exactly the given people, one portion each,
     * replacing what was there: attaching a scanned receipt to a group should
     * not mean re-ticking every line by hand.
     *
     * @param userIds - The new cast; every line is assigned to all of them.
     */
    shareEveryItemWith: (userIds: string[]) => {
      const everyone = Object.fromEntries(userIds.map((userId) => [userId, 1]));
      mapItems((item) => ({ ...item, assignees: { ...everyone } }));
    },
    tax: taxInput,
    setTax: setTaxInput,
    tip: tipInput,
    setTip: setTipInput,
    /**
     * Sets the tip to a percentage of the items subtotal, the way tip is
     * normally reckoned on a restaurant bill.
     *
     * @param percent - Whole-number percentage of the items subtotal.
     */
    applyTipPercent: (percent: number) => {
      setTipInput(centsToInput(Math.round((totals.itemsTotalCents * percent) / 100), currency));
    },
    ...totals,
    unassignedCount: unassignedCount(items ?? []),
    completeness: draftCompleteness(items ?? [], totals),
    /** What each person currently owes, keyed by user id, in cents. */
    previewShares: previewItemizedShares(items ?? [], totals.taxCents, totals.tipCents, currency),
    /** What still stops the bill adding up, as short sentences. */
    warnings: itemizedWarnings(items ?? [], currency),
  };
}

/** Everything {@link useItemDraft} returns; the single prop the item cards consume. */
export type ItemDraft = ReturnType<typeof useItemDraft>;
