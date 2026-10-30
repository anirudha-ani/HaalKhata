/** What an open edit form needs from a merge: its fields as a state, and the merged lines back as editable rows. */

import { nextDraftKey } from "../draftKey";
import { centsToInput, parseMoneyInput } from "../../money/money";
import type { DraftLineItem } from "../form/splitForm";
import { describeTheirChanges } from "./describeEdit";
import { expenseStateOf, type ExpenseState, type ExpenseStateSource, type LineState } from "./expenseState";
import { mergeExpenseEdit, type EditConflict, type EditPart } from "./mergeExpenseEdit";

/** An editable row, with the quantity a saved line always has. */
export type SavedDraftLine = DraftLineItem & { quantity: number };

/** The fields of an open expense form, as both apps hold them. */
export interface DraftExpenseFields {
  description: string;
  category: string;
  date: string;
  notes: string;
  splitType: string;
  /** The total as it stands; null while the amount field cannot be read. */
  totalCents: number | null;
  /** What each person owes as previewed; empty while the split cannot be worked out. */
  previewShares: Record<string, number>;
  /** Whether several people paid. */
  multiPayer: boolean;
  /** Who paid, when one person did. */
  singlePayerId: string;
  /** Raw paid amounts by person, when several did. */
  payerAmounts: Record<string, string>;
  items: readonly DraftLineItem[];
  taxCents: number;
  tipCents: number;
  /** The currency the form's amounts are typed in. */
  currency: string;
}

/**
 * Reads an open form as a state, so it can be compared with what it started
 * from: text the way it would be saved, amounts in cents.
 *
 * @param fields - The form's fields.
 * @returns The form as a state.
 */
export function draftExpenseState(fields: DraftExpenseFields): ExpenseState {
  const { currency, totalCents } = fields;
  const itemized = fields.splitType === "itemized";
  return {
    description: fields.description.trim(),
    category: fields.category,
    expenseDate: fields.date,
    notes: fields.notes,
    splitType: fields.splitType,
    amountCents: totalCents ?? 0,
    owed: fields.previewShares,
    payers: fields.multiPayer
      ? Object.fromEntries(
          Object.entries(fields.payerAmounts)
            .map(([userId, value]) => [userId, parseMoneyInput(value, currency) ?? 0] as const)
            .filter(([, cents]) => cents > 0),
        )
      : { [fields.singlePayerId]: totalCents ?? 0 },
    lines: itemized
      ? fields.items.map((item) => ({
          id: item.id ?? "",
          name: item.name.trim() || "Item",
          quantity: Math.max(1, item.quantity ?? 1),
          totalCents: parseMoneyInput(item.total, currency) ?? 0,
          shares: Object.fromEntries(Object.entries(item.assignees).filter(([, weight]) => weight > 0)),
        }))
      : [],
    taxCents: itemized ? fields.taxCents : 0,
    tipCents: itemized ? fields.tipCents : 0,
  };
}

/**
 * Puts merged lines back into a form's rows. A row keeps its key, and the
 * text somebody typed where it still means the same thing, so a line does not
 * jump or reformat under their finger when a change elsewhere arrives.
 *
 * @param draft - The rows as they are.
 * @param lines - The merged lines.
 * @param currency - The currency the rows are typed in.
 * @returns The rows to show.
 */
export function adoptDraftLines(
  draft: readonly DraftLineItem[],
  lines: readonly LineState[],
  currency: string,
): SavedDraftLine[] {
  const rowsById = new Map(draft.filter((entry) => entry.id).map((entry) => [entry.id, entry]));
  const unsavedRows = draft.filter((entry) => !entry.id);
  return lines.map((line) => {
    const draftRow = line.id ? rowsById.get(line.id) : unsavedRows.shift();
    const sameTotal = draftRow !== undefined && parseMoneyInput(draftRow.total, currency) === line.totalCents;
    const sameName = draftRow !== undefined && (draftRow.name.trim() || "Item") === line.name;
    return {
      key: draftRow?.key ?? nextDraftKey(),
      id: line.id || undefined,
      name: sameName ? draftRow.name : line.name,
      total: sameTotal ? draftRow.total : centsToInput(line.totalCents, currency),
      quantity: line.quantity,
      assignees: { ...line.shares },
    };
  });
}

/** What an open form does when it finds the expense has moved on. */
export interface FormCatchUp {
  /** The parts to take into the form; empty when there is nothing to take. */
  parts: Set<EditPart["part"]>;
  /** Their values. */
  merged: ExpenseState;
  /** Every conflict still waiting for an answer. */
  conflicts: EditConflict[];
  /** What to tell the person; "" when there is nothing to say. */
  note: string;
}

/**
 * Works out what an open form should do with the latest saved expense.
 *
 * @param change - The form's starting point, the form as it stands, the
 *   latest expense, who saved it, and conflicts already waiting.
 * @returns What to take in, what to ask, and what to say.
 */
export function catchUpForm(change: {
  base: ExpenseStateSource;
  form: ExpenseState;
  latest: ExpenseStateSource;
  /** Who saved the latest change, as a first name. */
  who: string;
  /** Whether that was this person, on another device or an earlier attempt. */
  byMe: boolean;
  held: readonly EditConflict[];
}): FormCatchUp {
  const latestState = expenseStateOf(change.latest);
  const outcome = mergeExpenseEdit(expenseStateOf(change.base), change.form, latestState);
  const fresh = new Set(outcome.conflicts.map((conflict) => editPartKey(conflict.edit)));
  return {
    parts: new Set(outcome.theirChanges.map((theirChange) => theirChange.part)),
    merged: outcome.merged,
    conflicts: [
      ...change.held.filter((conflict) => !fresh.has(editPartKey(conflict.edit))),
      ...outcome.conflicts,
    ],
    note: change.byMe ? "" : describeTheirChanges(outcome.theirChanges, latestState, change.who),
  };
}

/**
 * Answers one conflict with the saved value: the merged state takes it in
 * place of this person's.
 *
 * @param merged - The state being worked towards.
 * @param theirs - The expense as it is saved.
 * @param edit - The part to take.
 * @returns The state with that part as saved.
 */
export function takeTheirs(merged: ExpenseState, theirs: ExpenseState, edit: EditPart): ExpenseState {
  switch (edit.part) {
    case "money":
      return {
        ...merged,
        splitType: theirs.splitType,
        amountCents: theirs.amountCents,
        owed: theirs.owed,
        lines: theirs.lines,
        taxCents: theirs.taxCents,
        tipCents: theirs.tipCents,
      };
    case "payers":
      return { ...merged, payers: theirs.payers };
    case "line": {
      const saved = theirs.lines.find((line) => line.id === edit.lineId);
      const rest = merged.lines.filter((line) => line.id !== edit.lineId);
      if (!saved) return { ...merged, lines: rest };
      const held = merged.lines.some((line) => line.id === edit.lineId);
      return {
        ...merged,
        lines: held
          ? merged.lines.map((line) => (line.id === edit.lineId ? { ...saved, shares: line.shares } : line))
          : [...rest, saved],
      };
    }
    case "share": {
      const portion = theirs.lines.find((line) => line.id === edit.lineId)?.shares[edit.userId] ?? 0;
      return {
        ...merged,
        lines: merged.lines.map((line) => {
          if (line.id !== edit.lineId) return line;
          const shares = { ...line.shares };
          if (portion > 0) shares[edit.userId] = portion;
          else delete shares[edit.userId];
          return { ...line, shares };
        }),
      };
    }
    default:
      return { ...merged, [edit.part]: theirs[edit.part] };
  }
}

/**
 * A stable name for one part of an expense, for telling conflicts apart.
 *
 * @param edit - The part.
 * @returns Text unique to that part.
 */
export function editPartKey(edit: EditPart): string {
  if (edit.part === "line") return `line:${edit.lineId}`;
  if (edit.part === "share") return `share:${edit.lineId}:${edit.userId}`;
  return edit.part;
}
