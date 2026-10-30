/** Three-way merge of an expense edit: what this person changed goes on top of what everyone else saved, part by part. */

import { SplitError } from "../splits";
import {
  sameLine,
  sameLineDetails,
  sameMoney,
  samePayers,
  withComputedShares,
  type ExpenseState,
  type LineState,
} from "./expenseState";

/** The fields of an expense that are a single piece of text each. */
const TEXT_PARTS = ["description", "category", "expenseDate", "notes"] as const;

/** The fields of an itemized expense that are a single amount each. */
const AMOUNT_PARTS = ["taxCents", "tipCents"] as const;

/** One thing on an expense that two people can change without touching each other's work. */
export type EditPart =
  | { part: (typeof TEXT_PARTS)[number] | (typeof AMOUNT_PARTS)[number] }
  /** The amount and the split of an expense that is not itemized: they must add up, so they move together. */
  | { part: "money" }
  /** Who paid. */
  | { part: "payers" }
  /** A receipt line's name, quantity and price, or the line being added or removed. */
  | { part: "line"; lineId: string }
  /** One person's portion of a receipt line. */
  | { part: "share"; lineId: string; userId: string };

/** Two people changed the same part to different values. */
export interface EditConflict {
  edit: EditPart;
  /** The line it is about; "" when it is not about a line. */
  lineName: string;
  /** This person's value: the text, the amount, a line's price or a portion; null when they removed the line. */
  mine: string | number | null;
  /** The saved value, as for `mine`; null when somebody else removed the line. */
  theirs: string | number | null;
}

/** What a merge came to. */
export interface ExpenseMerge {
  /** The expense with this person's changes on top of what is saved. Where they conflict it holds this person's value. */
  merged: ExpenseState;
  /** Parts both people changed differently. Nothing should be saved until each has been answered. */
  conflicts: EditConflict[];
  /** Parts somebody else changed that this person left alone: an open form takes these in. */
  theirChanges: EditPart[];
}

/** How a merge should treat the expense it is for. */
export interface MergeOptions {
  /** A line may stay unclaimed: true while a live split runs, when lines start with nobody on them. */
  allowUnclaimed?: boolean;
}

/**
 * Merges one person's edit into the expense as it stands now.
 *
 * Each part is decided on its own: changed by this person only, it takes
 * their value; changed by somebody else only, it stays as saved; changed by
 * both to the same value, there is nothing to decide; changed by both to
 * different values, it is a conflict. A receipt merges line by line and
 * person by person, so two people can each put themselves on the same pizza.
 *
 * The shares and the total of an itemized expense are worked out again from
 * the merged lines. If those lines cannot make a bill, or several payers'
 * typed amounts no longer add up to the new total, that is a conflict too: a
 * merge never saves money that does not reconcile.
 *
 * @param base - The expense as this person opened it.
 * @param mine - The expense as this person wants it.
 * @param theirs - The expense as it is saved now.
 * @param options - How to treat unclaimed lines.
 * @returns The merged expense, any conflicts, and what somebody else changed.
 */
export function mergeExpenseEdit(
  base: ExpenseState,
  mine: ExpenseState,
  theirs: ExpenseState,
  options: MergeOptions = {},
): ExpenseMerge {
  const conflicts: EditConflict[] = [];
  const theirChanges: EditPart[] = [];
  let merged: ExpenseState = { ...theirs };

  for (const part of TEXT_PARTS) {
    const mineChanged = mine[part] !== base[part];
    const theirChanged = theirs[part] !== base[part];
    if (mineChanged && theirChanged && mine[part] !== theirs[part]) {
      conflicts.push({ edit: { part }, lineName: "", mine: mine[part], theirs: theirs[part] });
    } else if (theirChanged && !mineChanged) {
      theirChanges.push({ part });
    }
    if (mineChanged) merged[part] = mine[part];
  }

  const itemized = [base, mine, theirs].every((state) => state.splitType === "itemized");
  if (itemized) {
    for (const part of AMOUNT_PARTS) {
      const mineChanged = mine[part] !== base[part];
      const theirChanged = theirs[part] !== base[part];
      if (mineChanged && theirChanged && mine[part] !== theirs[part]) {
        conflicts.push({ edit: { part }, lineName: "", mine: mine[part], theirs: theirs[part] });
      } else if (theirChanged && !mineChanged) {
        theirChanges.push({ part });
      }
      if (mineChanged) merged[part] = mine[part];
    }
    merged.lines = mergeLines(base, mine, theirs, conflicts, theirChanges);
  } else {
    const mineMoved = !sameMoney(base, mine);
    const theirsMoved = !sameMoney(base, theirs);
    if (mineMoved && theirsMoved && !sameMoney(mine, theirs)) {
      conflicts.push({ edit: { part: "money" }, lineName: "", mine: mine.amountCents, theirs: theirs.amountCents });
    } else if (theirsMoved && !mineMoved) {
      theirChanges.push({ part: "money" });
    }
    if (mineMoved) merged = { ...merged, ...moneyOf(mine) };
  }

  const minePaidDifferently = !samePayers(base, mine);
  const theirsPaidDifferently = !samePayers(base, theirs);
  if (minePaidDifferently && theirsPaidDifferently && !samePayers(mine, theirs)) {
    conflicts.push({ edit: { part: "payers" }, lineName: "", mine: null, theirs: null });
  } else if (theirsPaidDifferently && !minePaidDifferently) {
    theirChanges.push({ part: "payers" });
  }
  if (minePaidDifferently) merged.payers = mine.payers;

  if (!options.allowUnclaimed) {
    for (const line of merged.lines) {
      if (Object.keys(line.shares).length > 0 || !itemized) continue;
      // Each person took somebody off, and between them took everybody off.
      conflicts.push({ edit: { part: "line", lineId: line.id }, lineName: line.name, mine: line.totalCents, theirs: line.totalCents });
    }
  }

  // Lines nobody has claimed sit with whoever paid, so a new payer moves money too.
  if (itemized && (!sameMoney(merged, theirs) || !samePayers(merged, theirs))) {
    try {
      merged = withComputedShares(merged);
    } catch (error) {
      if (!(error instanceof SplitError)) throw error;
      conflicts.push({ edit: { part: "money" }, lineName: "", mine: mine.amountCents, theirs: theirs.amountCents });
    }
  }
  merged.payers = payersFor(merged, conflicts);
  return { merged, conflicts, theirChanges };
}

/**
 * The parts of a state that move together on an expense that is not itemized.
 *
 * @param state - The state.
 * @returns Its split, amount and any lines.
 */
function moneyOf(state: ExpenseState) {
  return {
    splitType: state.splitType,
    amountCents: state.amountCents,
    owed: state.owed,
    lines: state.lines,
    taxCents: state.taxCents,
    tipCents: state.tipCents,
  };
}

/**
 * Fits who paid to the merged total: one person simply covers it, while
 * several people's typed amounts are theirs alone to change.
 *
 * @param merged - The merged expense.
 * @param conflicts - Where to record that several payers no longer add up.
 * @returns What each person paid.
 */
function payersFor(merged: ExpenseState, conflicts: EditConflict[]): Record<string, number> {
  const payerIds = Object.keys(merged.payers);
  if (payerIds.length === 1) return { [payerIds[0]]: merged.amountCents };
  const paidCents = Object.values(merged.payers).reduce((running, cents) => running + cents, 0);
  if (paidCents !== merged.amountCents && !conflicts.some((conflict) => conflict.edit.part === "payers")) {
    conflicts.push({ edit: { part: "payers" }, lineName: "", mine: paidCents, theirs: merged.amountCents });
  }
  return merged.payers;
}

/**
 * Merges a receipt line by line.
 *
 * @param base - The expense as this person opened it.
 * @param mine - The expense as this person wants it.
 * @param theirs - The expense as it is saved now.
 * @param conflicts - Where to record conflicts.
 * @param theirChanges - Where to record what somebody else changed.
 * @returns The merged lines: the saved ones in their order, then this person's new ones.
 */
function mergeLines(
  base: ExpenseState,
  mine: ExpenseState,
  theirs: ExpenseState,
  conflicts: EditConflict[],
  theirChanges: EditPart[],
): LineState[] {
  const baseLines = new Map(base.lines.map((line) => [line.id, line]));
  const mineLines = new Map(mine.lines.filter((line) => line.id !== "").map((line) => [line.id, line]));
  const savedIds = new Set(theirs.lines.map((line) => line.id));
  const lines: LineState[] = [];

  for (const line of theirs.lines) {
    const mineLine = mineLines.get(line.id);
    const baseLine = baseLines.get(line.id);
    if (!baseLine) {
      // Added since this person opened it. A form that has already taken it
      // in carries it too, and any change made to it there is theirs to keep.
      if (mineLine) {
        lines.push(mergeOneLine(line, mineLine, line, conflicts, theirChanges));
      } else {
        theirChanges.push({ part: "line", lineId: line.id });
        lines.push(line);
      }
      continue;
    }
    if (mineLine) {
      lines.push(mergeOneLine(baseLine, mineLine, line, conflicts, theirChanges));
    } else if (sameLine(baseLine, line)) {
      // This person removed it and nobody touched it since: it goes.
    } else {
      conflicts.push({ edit: { part: "line", lineId: line.id }, lineName: line.name, mine: null, theirs: line.totalCents });
    }
  }

  for (const line of mine.lines) {
    if (line.id === "" || (!savedIds.has(line.id) && !baseLines.has(line.id))) {
      lines.push({ ...line, id: "" });
    } else if (!savedIds.has(line.id)) {
      const baseLine = baseLines.get(line.id) as LineState;
      if (sameLine(baseLine, line)) {
        theirChanges.push({ part: "line", lineId: line.id });
      } else {
        conflicts.push({ edit: { part: "line", lineId: line.id }, lineName: line.name, mine: line.totalCents, theirs: null });
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * Merges one line that is still there on both sides: its details as one part,
 * and each person's portion as a part of its own.
 *
 * @param baseLine - The line as this person opened it.
 * @param mineLine - The line as this person wants it.
 * @param theirLine - The line as it is saved now.
 * @param conflicts - Where to record conflicts.
 * @param theirChanges - Where to record what somebody else changed.
 * @returns The merged line.
 */
function mergeOneLine(
  baseLine: LineState,
  mineLine: LineState,
  theirLine: LineState,
  conflicts: EditConflict[],
  theirChanges: EditPart[],
): LineState {
  const lineId = theirLine.id;
  const mineChanged = !sameLineDetails(baseLine, mineLine);
  const theirChanged = !sameLineDetails(baseLine, theirLine);
  if (mineChanged && theirChanged && !sameLineDetails(mineLine, theirLine)) {
    conflicts.push({
      edit: { part: "line", lineId },
      lineName: theirLine.name,
      mine: mineLine.totalCents,
      theirs: theirLine.totalCents,
    });
  } else if (theirChanged && !mineChanged) {
    theirChanges.push({ part: "line", lineId });
  }
  const details = mineChanged ? mineLine : theirLine;

  const shares: Record<string, number> = {};
  const people = new Set([baseLine, mineLine, theirLine].flatMap((line) => Object.keys(line.shares)));
  for (const userId of people) {
    const basePortion = baseLine.shares[userId] ?? 0;
    const minePortion = mineLine.shares[userId] ?? 0;
    const theirPortion = theirLine.shares[userId] ?? 0;
    const minePortionChanged = minePortion !== basePortion;
    const theirPortionChanged = theirPortion !== basePortion;
    if (minePortionChanged && theirPortionChanged && minePortion !== theirPortion) {
      conflicts.push({
        edit: { part: "share", lineId, userId },
        lineName: theirLine.name,
        mine: minePortion,
        theirs: theirPortion,
      });
    } else if (theirPortionChanged && !minePortionChanged) {
      theirChanges.push({ part: "share", lineId, userId });
    }
    const portion = minePortionChanged ? minePortion : theirPortion;
    if (portion > 0) shares[userId] = portion;
  }
  return {
    id: lineId,
    name: details.name,
    quantity: details.quantity,
    totalCents: details.totalCents,
    shares,
  };
}
