/** An expense reduced to what people can change on it, in one shape for the server's rows, its messages and an open form. */

import { allocate } from "../allocate";
import { computeUnclaimedSplits, type ItemInput } from "../splits";

/** One line of a receipt. */
export interface LineState {
  /** The line's id; "" for a line not saved yet. */
  id: string;
  name: string;
  quantity: number;
  totalCents: number;
  /** Portions by person; nobody on it yet means the line is unclaimed. */
  shares: Record<string, number>;
}

/** Everything about an expense that somebody can edit. */
export interface ExpenseState {
  description: string;
  category: string;
  expenseDate: string;
  notes: string;
  splitType: string;
  amountCents: number;
  /** What each person owes, in cents. */
  owed: Record<string, number>;
  /** What each person paid, in cents. */
  payers: Record<string, number>;
  lines: LineState[];
  taxCents: number;
  tipCents: number;
}

/** Any expense-shaped value: a database row's write, a message, or a form's request. */
export interface ExpenseStateSource {
  description: string;
  category: string;
  expenseDate: string;
  notes: string;
  splitType: string;
  amountCents: number;
  taxCents: number;
  tipCents: number;
  payers: readonly { userId: string; amountCents: number }[];
  splits: readonly { userId: string; owedCents: number }[];
  items: readonly {
    id?: string;
    name: string;
    quantity: number;
    totalCents: number;
    assignments: readonly { userId: string; weight: number }[];
  }[];
}

/**
 * Reduces any expense-shaped value to its {@link ExpenseState}.
 *
 * @param source - The expense.
 * @returns Its state.
 */
export function expenseStateOf(source: ExpenseStateSource): ExpenseState {
  return {
    description: source.description,
    category: source.category,
    expenseDate: source.expenseDate,
    notes: source.notes,
    splitType: source.splitType,
    amountCents: source.amountCents,
    owed: Object.fromEntries(source.splits.map((split) => [split.userId, split.owedCents])),
    payers: Object.fromEntries(source.payers.map((payer) => [payer.userId, payer.amountCents])),
    lines: source.items.map((item) => ({
      id: item.id ?? "",
      name: item.name,
      quantity: item.quantity,
      totalCents: item.totalCents,
      shares: Object.fromEntries(item.assignments.map((assignment) => [assignment.userId, assignment.weight])),
    })),
    taxCents: source.taxCents,
    tipCents: source.tipCents,
  };
}

/**
 * Compares two records of figures by person, whatever order they were built in.
 *
 * @param first - One record.
 * @param second - The other.
 * @returns True when they hold the same people with the same figures.
 */
function sameRecord(first: Record<string, number>, second: Record<string, number>): boolean {
  const people = Object.keys(first);
  return people.length === Object.keys(second).length && people.every((person) => first[person] === second[person]);
}

/**
 * Whether two lines say the same thing about what was bought, leaving out who had it.
 *
 * @param first - One line.
 * @param second - The other.
 * @returns True when name, quantity and price all match.
 */
export function sameLineDetails(first: LineState, second: LineState): boolean {
  return first.name === second.name && first.quantity === second.quantity && first.totalCents === second.totalCents;
}

/**
 * Whether two lines are the same in every respect but their id.
 *
 * @param first - One line.
 * @param second - The other.
 * @returns True when the details and everybody's portions match.
 */
export function sameLine(first: LineState, second: LineState): boolean {
  return sameLineDetails(first, second) && sameRecord(first.shares, second.shares);
}

/**
 * Whether two states pay out the same way between the same people. An equal
 * split hands its odd cents to whoever is listed first, and each editor's
 * form lists a different person first, so equal splits are compared by the
 * amount and who is in, never by their cents: reading the same expense on two
 * phones must not look like a change.
 *
 * Ratios are not stored, only what they came to, so a percent split reopens
 * as the same amounts: that is the same money, whatever the mode is called.
 *
 * @param first - One state.
 * @param second - The other.
 * @returns True when neither moved any money the other did not.
 */
export function sameMoney(first: ExpenseState, second: ExpenseState): boolean {
  if (first.amountCents !== second.amountCents) return false;
  const firstItemized = first.splitType === "itemized";
  if (firstItemized !== (second.splitType === "itemized")) return false;
  if (firstItemized) {
    if (first.taxCents !== second.taxCents || first.tipCents !== second.tipCents) return false;
    if (first.lines.length !== second.lines.length) return false;
    const unmatched = [...second.lines];
    return first.lines.every((line) => {
      const match = unmatched.findIndex((candidate) => sameLine(line, candidate));
      if (match === -1) return false;
      unmatched.splice(match, 1);
      return true;
    });
  }
  if (first.splitType === "equal" && second.splitType === "equal") {
    const firstPeople = sharingIds(first);
    const secondPeople = new Set(sharingIds(second));
    return firstPeople.length === secondPeople.size && firstPeople.every((userId) => secondPeople.has(userId));
  }
  return sameRecord(first.owed, second.owed);
}

/**
 * Who has a part of an even split. Somebody can be on the bill at nothing, and
 * ticking them moves everyone's share, so being listed is not enough.
 *
 * @param state - The state.
 * @returns Everyone with something to pay.
 */
function sharingIds(state: ExpenseState): string[] {
  return Object.keys(state.owed).filter((userId) => (state.owed[userId] ?? 0) > 0);
}

/**
 * Whether two states say the same people paid. One person paying covers
 * whatever the total is, so only their name counts; between several people
 * what each paid does.
 *
 * @param first - One state.
 * @param second - The other.
 * @returns True when the same people paid the same way.
 */
export function samePayers(first: ExpenseState, second: ExpenseState): boolean {
  const firstPeople = Object.keys(first.payers);
  const secondPeople = Object.keys(second.payers);
  if (firstPeople.length === 1 && secondPeople.length === 1) return firstPeople[0] === secondPeople[0];
  return sameRecord(first.payers, second.payers);
}

/**
 * Whether saving `second` over `first` would change nothing anybody could see.
 *
 * @param first - One state.
 * @param second - The other.
 * @returns True when they are the same expense.
 */
export function sameExpense(first: ExpenseState, second: ExpenseState): boolean {
  return first.description === second.description
    && first.category === second.category
    && first.expenseDate === second.expenseDate
    && first.notes === second.notes
    && sameMoney(first, second)
    && samePayers(first, second);
}

/**
 * Turns lines into the items the split math reads. Everybody's portions go in
 * by person id, so the cent a line's rounding hands out lands on the same
 * person whoever's phone added them to it.
 *
 * @param lines - The lines.
 * @returns The items to compute shares from.
 */
export function linesToItems(lines: readonly LineState[]): ItemInput[] {
  return lines.map((line) => ({
    name: line.name,
    totalCents: line.totalCents,
    assignments: Object.keys(line.shares).sort().map((userId) => ({ userId, weight: line.shares[userId] })),
  }));
}

/**
 * Works out a state's total and everybody's share again from its lines. Only
 * for an itemized state: that is the one kind whose figures follow from its
 * parts.
 *
 * @param state - The itemized state.
 * @returns The same state with its total and shares recalculated.
 * @throws SplitError when the lines cannot make a bill (none left, or nothing to pay).
 */
export function withComputedShares(state: ExpenseState): ExpenseState {
  const { splits, totalCents } = computeUnclaimedSplits(
    linesToItems(state.lines),
    state.taxCents,
    state.tipCents,
    Object.entries(state.payers).map(([userId, amountCents]) => ({ userId, amountCents })),
  );
  return {
    ...state,
    amountCents: totalCents,
    owed: Object.fromEntries(splits.map((split) => [split.userId, split.owedCents])),
  };
}

/**
 * Fits what each person paid to a total, keeping their proportions. Somebody
 * who paid drops off when nothing is left for them.
 *
 * @param payers - What each person paid, in cents.
 * @param totalCents - What it should add up to.
 * @returns What each person paid now, adding up to exactly the total.
 */
export function fitPayers(payers: Record<string, number>, totalCents: number): Record<string, number> {
  const payerIds = Object.keys(payers).sort();
  const fitted = allocate(totalCents, payerIds.map((payerId) => payers[payerId]));
  return Object.fromEntries(
    payerIds.flatMap((payerId, position) => (fitted[position] > 0 ? [[payerId, fitted[position]]] : [])),
  );
}

/**
 * Works out an itemized state again where a total can move and nobody is
 * asked to retype anything: a live split. What each person paid follows the
 * total first, because lines nobody has claimed follow what each person paid.
 *
 * @param state - The itemized state.
 * @returns The same state with its total, who paid and shares right.
 * @throws SplitError when the lines cannot make a bill (none left, or nothing to pay).
 */
export function withFittedPayers(state: ExpenseState): ExpenseState {
  const { amountCents } = withComputedShares(state);
  return withComputedShares({ ...state, payers: fitPayers(state.payers, amountCents) });
}
