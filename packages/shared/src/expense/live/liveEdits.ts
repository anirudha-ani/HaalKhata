/** One tap on a live split, as a change to the expense, and the request that saves it. */

import { allocate } from "../allocate";
import { withComputedShares, type ExpenseState, type LineState } from "../merge/expenseState";
import {
  LIVE_EVERYONE_SETTLED_LABEL,
  LIVE_MY_SHARE_LABEL,
  LIVE_OTHERS_SHARES_LABEL,
  LIVE_SHARE_SETTLED_LABEL,
} from "./live.constants";

/** A change somebody makes to a live split. Applied to the latest expense, so it survives others' changes arriving first. */
export type LiveEdit = (state: ExpenseState) => ExpenseState;

/**
 * Works the bill out again after a change to its lines, tax or tip: the total,
 * everybody's share, and what the one payer covered.
 *
 * @param state - The changed state.
 * @returns The same state with its figures right.
 */
function recomputed(state: ExpenseState): ExpenseState {
  const computed = withComputedShares(state);
  const payerIds = Object.keys(computed.payers);
  return payerIds.length === 1 ? { ...computed, payers: { [payerIds[0]]: computed.amountCents } } : computed;
}

/**
 * Applies a change to one line.
 *
 * @param state - The state.
 * @param lineId - The line.
 * @param change - What to change on it.
 * @returns The new state.
 */
function changeLine(state: ExpenseState, lineId: string, change: (line: LineState) => LineState): ExpenseState {
  return recomputed({ ...state, lines: state.lines.map((line) => (line.id === lineId ? change(line) : line)) });
}

/**
 * Puts somebody on a line or takes them off it. Absolute rather than a
 * toggle: tapped again after a lost reply, it says the same thing.
 *
 * @param lineId - The line.
 * @param userId - Who.
 * @param isOn - Whether they should be on it.
 * @returns The edit.
 */
export function setOnLine(lineId: string, userId: string, isOn: boolean): LiveEdit {
  return (state) =>
    changeLine(state, lineId, (line) => {
      const shares = { ...line.shares };
      if (isOn) shares[userId] = shares[userId] ?? 1;
      else delete shares[userId];
      return { ...line, shares };
    });
}

/**
 * Corrects a line's name or price.
 *
 * @param lineId - The line.
 * @param details - Its new name and price.
 * @returns The edit.
 */
export function setLineDetails(lineId: string, details: { name: string; totalCents: number }): LiveEdit {
  return (state) => changeLine(state, lineId, (line) => ({ ...line, ...details }));
}

/**
 * Adds a line nobody is on yet.
 *
 * @param details - Its name and price.
 * @returns The edit.
 */
export function addLine(details: { name: string; totalCents: number }): LiveEdit {
  return (state) => recomputed({ ...state, lines: [...state.lines, { id: "", quantity: 1, shares: {}, ...details }] });
}

/**
 * Removes a line.
 *
 * @param lineId - The line.
 * @returns The edit.
 */
export function removeLine(lineId: string): LiveEdit {
  return (state) => recomputed({ ...state, lines: state.lines.filter((line) => line.id !== lineId) });
}

/**
 * Sets the tax and the tip.
 *
 * @param amounts - The new amounts.
 * @returns The edit.
 */
export function setTaxAndTip(amounts: { taxCents: number; tipCents: number }): LiveEdit {
  return (state) => recomputed({ ...state, ...amounts });
}

/**
 * The request that saves a state, for an expense whose scope cannot change.
 *
 * @param expense - The expense's group and currency.
 * @param state - The state to save.
 * @param operationId - Names this attempt.
 * @returns The request.
 */
export function liveEditRequest(expense: { groupId: string; currency: string }, state: ExpenseState, operationId: string) {
  return {
    groupId: expense.groupId,
    description: state.description,
    amountCents: state.amountCents,
    currency: expense.currency,
    category: state.category,
    expenseDate: state.expenseDate,
    splitType: "itemized",
    notes: state.notes,
    payers: Object.entries(state.payers).map(([userId, amountCents]) => ({ userId, amountCents })),
    splitSpecs: [],
    items: state.lines.map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      totalCents: line.totalCents,
      assignments: Object.keys(line.shares).sort().map((userId) => ({ userId, weight: line.shares[userId] })),
    })),
    taxCents: state.taxCents,
    tipCents: state.tipCents,
    operationId,
  };
}

/** What a live split comes to at the moment, for one person. */
export interface LiveSummary {
  /** Who paid; "" when several people did. */
  payerId: string;
  /** What this person owes for the bill, tax and tip included. */
  myShareCents: number;
  /** What the lines nobody has claimed add up to, before tax and tip. */
  unclaimedCents: number;
  /** How many lines nobody has claimed. */
  unclaimedLines: number;
}

/**
 * Sums up a live split for one person.
 *
 * @param state - The expense.
 * @param userId - Who is looking.
 * @returns What it comes to for them.
 */
export function liveSummary(state: ExpenseState, userId: string): LiveSummary {
  const payerIds = Object.keys(state.payers);
  const unclaimed = state.lines.filter((line) => Object.keys(line.shares).length === 0);
  return {
    payerId: payerIds.length === 1 ? payerIds[0] : "",
    myShareCents: state.owed[userId] ?? 0,
    unclaimedCents: unclaimed.reduce((running, line) => running + line.totalCents, 0),
    unclaimedLines: unclaimed.length,
  };
}

/** The headline figure of a live split, for one person. */
export interface LiveTotal {
  /** What the figure is. */
  label: string;
  /** The figure. */
  cents: number;
  /** Whether this person may still have something to pay, which is what Settle is for. */
  owing: boolean;
}

/**
 * Works out the headline figure for one person. "Settled" comes from the
 * server's reading of the balance, because the bill alone cannot say who has
 * paid; see {@link withSavedEdit} for why it can go out of date.
 *
 * @param state - The expense.
 * @param userId - Who is looking.
 * @param isSettled - Whether this person's balance in the expense's scope is even.
 * @returns The figure and what it means.
 */
export function liveTotal(state: ExpenseState, userId: string, isSettled: boolean): LiveTotal {
  const { payerId, myShareCents } = liveSummary(state, userId);
  if (payerId === userId) {
    const othersCents = state.amountCents - myShareCents;
    return {
      label: isSettled && othersCents > 0 ? LIVE_EVERYONE_SETTLED_LABEL : LIVE_OTHERS_SHARES_LABEL,
      cents: othersCents,
      owing: false,
    };
  }
  const paidUp = isSettled && myShareCents > 0;
  return { label: paidUp ? LIVE_SHARE_SETTLED_LABEL : LIVE_MY_SHARE_LABEL, cents: myShareCents, owing: !paidUp };
}

/**
 * What a device holds once one of its taps has saved. The answer the server
 * saved comes back as an expense alone, and a tap can change what somebody
 * owes, so "settled" no longer stands until the next full read says so:
 * somebody with nothing owed who claims a line owes money from that moment.
 *
 * @param current - What the device holds.
 * @param saved - The expense as saved.
 * @returns What it should hold, unchanged when it has already seen something newer.
 */
export function withSavedEdit<Saved extends { version: number }, Detail extends { expense?: Saved; settledForViewer: boolean }>(
  current: Detail | undefined,
  saved: Saved,
): Detail | undefined {
  if (!current?.expense || saved.version < current.expense.version) return current;
  return { ...current, expense: saved, settledForViewer: false };
}

/**
 * This person's share of one line, before tax and tip.
 *
 * @param line - The line.
 * @param userId - Who.
 * @returns The share in cents; null when they are not on it.
 */
export function lineShareCents(line: LineState, userId: string): number | null {
  const people = Object.keys(line.shares).sort();
  const index = people.indexOf(userId);
  if (index === -1) return null;
  return allocate(line.totalCents, people.map((person) => line.shares[person]))[index];
}

/**
 * How long a live split has left, in words.
 *
 * @param endsAt - When it ends (ISO 8601).
 * @param clock - The time now, in milliseconds.
 * @returns The words; "" once it is over.
 */
export function liveTimeLeft(endsAt: string, clock: number): string {
  const secondsLeft = Math.ceil((new Date(endsAt).getTime() - clock) / 1000);
  if (secondsLeft <= 0) return "";
  if (secondsLeft < 60) return "Under a minute left";
  return `${Math.ceil(secondsLeft / 60)} min left`;
}
