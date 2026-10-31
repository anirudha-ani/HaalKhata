/** The words for what happened when two people edited an expense at once, one set for both apps. */

import { formatMoney } from "../../money/money";
import { MAX_NAMED_CHANGES } from "./merge.constants";
import type { ExpenseState } from "./expenseState";
import type { EditConflict, EditPart } from "./mergeExpenseEdit";

/** What the words need to know. */
export interface EditWording {
  /** Who saved the change: a first name, or "Someone". */
  who: string;
  /** The expense's currency. */
  currency: string;
  /**
   * Names a person on a line.
   *
   * @param userId - Their id.
   * @returns Their name.
   */
  nameOf: (userId: string) => string;
}

/** What each simple part is called in a sentence. */
const PART_NAMES = {
  description: "the name",
  category: "the category",
  expenseDate: "the date",
  notes: "the notes",
  taxCents: "the tax",
  tipCents: "the tip",
  money: "the amount or split",
  payers: "who paid",
} as const;

/**
 * Says what a conflict is, with both values where they can be shown.
 *
 * @param conflict - The conflict.
 * @param wording - Who it was and how to show amounts.
 * @returns A sentence to put beside the two choices.
 */
export function describeEditConflict(conflict: EditConflict, wording: EditWording): string {
  const { who, currency } = wording;
  const { edit, lineName, mine, theirs } = conflict;
  const money = (cents: string | number | null) => formatMoney(Number(cents ?? 0), currency);
  switch (edit.part) {
    case "description":
      return `${who} renamed this to “${theirs}”. You have “${mine}”.`;
    case "expenseDate":
      return `${who} set the date to ${theirs}. You have ${mine}.`;
    case "category":
      return `${who} set the category to ${theirs}. You have ${mine}.`;
    case "notes":
      return `${who} changed the notes, and so did you.`;
    case "taxCents":
    case "tipCents":
      return `${who} set ${PART_NAMES[edit.part]} to ${money(theirs)}. You have ${money(mine)}.`;
    case "money":
      return `${who} changed the amount or split, and so did you. Theirs comes to ${money(theirs)}, yours to ${money(mine)}.`;
    case "payers":
      return mine === null
        ? `${who} changed who paid, and so did you.`
        : `The amounts paid come to ${money(mine)}, but the total is now ${money(theirs)}.`;
    case "line":
      if (theirs === null) return `${who} removed ${lineName}, and you changed it.`;
      if (mine === null) return `You removed ${lineName}, and ${who} changed it.`;
      if (mine === theirs) return `${who} changed ${lineName}, and so did you.`;
      return `${who} set ${lineName} to ${money(theirs)}. You have ${money(mine)}.`;
    case "share":
      return `${who} set ${wording.nameOf(edit.userId)}’s portion of ${lineName} to ${theirs}. You have ${mine}.`;
  }
}

/**
 * Says what somebody else changed, for the note that appears when a form
 * takes it in.
 *
 * @param changes - The parts they changed.
 * @param latest - The expense as saved, to name its lines.
 * @param editor - Who it was.
 * @returns The note; "" when there is nothing to say.
 */
export function describeTheirChanges(changes: readonly EditPart[], latest: ExpenseState, editor: string): string {
  const named = [
    ...new Set(
      changes.map((change) => {
        if (change.part !== "line" && change.part !== "share") return PART_NAMES[change.part];
        return latest.lines.find((line) => line.id === change.lineId)?.name ?? "a line";
      }),
    ),
  ];
  if (named.length === 0) return "";
  const shown = named.slice(0, MAX_NAMED_CHANGES);
  const list = named.length > MAX_NAMED_CHANGES
    ? `${shown.join(", ")} and more`
    : shown.length > 1
      ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
      : shown[0];
  return `${editor} changed ${list}.`;
}
