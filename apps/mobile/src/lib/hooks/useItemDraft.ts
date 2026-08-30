/** Editable itemized-draft state shared by the receipt scan flow and the expense form. */

import { useState } from "react";
import { nextDraftKey } from "@haalkhata/shared/expense/draftKey";
import {
  draftCompleteness,
  draftTotals,
  unassignedCount,
  type DraftItem,
} from "@/lib/expense/itemDraft";

/**
 * Holds a draft's line items with their assignees, plus the tax and tip
 * inputs, and exposes the editing moves both callers need: correct a line,
 * tap people onto it, assign everything to one person, add or remove lines,
 * and drop a person who left the expense.
 *
 * @param initial - Starting lines (null while a receipt has not been parsed
 *   yet), and the raw tax and tip inputs.
 * @returns The draft state, its editing helpers, and the derived totals,
 *   unassigned count, and completeness check.
 */
export function useItemDraft(initial: { items: DraftItem[] | null; tax: string; tip: string }) {
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

  const totals = draftTotals(items ?? [], taxInput, tipInput);

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
     * Toggles whether a person shares a line.
     *
     * @param index - Position of the line in the draft.
     * @param userId - Id of the person to toggle on that line.
     */
    toggleAssignee: (index: number, userId: string) => {
      mapItems((item, itemIndex) =>
        itemIndex === index
          ? { ...item, assignees: { ...item.assignees, [userId]: !item.assignees[userId] } }
          : item,
      );
    },
    /**
     * Adds a person to every line (leaving other assignees untouched).
     *
     * @param userId - Id of the person to add everywhere.
     */
    assignAllTo: (userId: string) => {
      mapItems((item) => ({ ...item, assignees: { ...item.assignees, [userId]: true } }));
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
    tax: taxInput,
    setTax: setTaxInput,
    tip: tipInput,
    setTip: setTipInput,
    ...totals,
    unassignedCount: unassignedCount(items ?? []),
    completeness: draftCompleteness(items ?? [], totals),
  };
}

/** Everything {@link useItemDraft} returns; the single prop ItemDraftEditor consumes. */
export type ItemDraft = ReturnType<typeof useItemDraft>;
