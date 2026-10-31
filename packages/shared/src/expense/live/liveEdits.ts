/** One tap on a live split, as a change to the expense, and the request that saves it. */

import { formatMoney, parseMoneyInput } from "../../money/money";
import { allocate } from "../allocate";
import { expenseDebts } from "../debts";
import { fitPayers, withFittedPayers, type ExpenseState, type LineState } from "../merge/expenseState";
import {
  LIVE_COVERED_LABEL,
  LIVE_EVERYONE_SETTLED_LABEL,
  LIVE_MY_SHARE_LABEL,
  LIVE_PAID_AMOUNT_MESSAGE,
  LIVE_SHARE_SETTLED_LABEL,
  paidTooMuchMessage,
} from "./live.constants";

/** A change somebody makes to a live split. Applied to the latest expense, so it survives others' changes arriving first. */
export type LiveEdit = (state: ExpenseState) => ExpenseState;

/**
 * Applies a change to one line.
 *
 * @param state - The state.
 * @param lineId - The line.
 * @param change - What to change on it.
 * @returns The new state.
 */
function changeLine(state: ExpenseState, lineId: string, change: (line: LineState) => LineState): ExpenseState {
  return withFittedPayers({ ...state, lines: state.lines.map((line) => (line.id === lineId ? change(line) : line)) });
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
  return (state) => withFittedPayers({ ...state, lines: [...state.lines, { id: "", quantity: 1, shares: {}, ...details }] });
}

/**
 * Removes a line.
 *
 * @param lineId - The line.
 * @returns The edit.
 */
export function removeLine(lineId: string): LiveEdit {
  return (state) => withFittedPayers({ ...state, lines: state.lines.filter((line) => line.id !== lineId) });
}

/**
 * Sets the tax and the tip.
 *
 * @param amounts - The new amounts.
 * @returns The edit.
 */
export function setTaxAndTip(amounts: { taxCents: number; tipCents: number }): LiveEdit {
  return (state) => withFittedPayers({ ...state, ...amounts });
}

/**
 * Says what somebody paid, adding them if they had not paid before: a second
 * card, or the whole bill if it was never who it said. Everybody else who paid
 * shares what is left, in proportion, so the bill always adds up and nobody
 * has to sort out anyone else's figure first. Whoever is left with nothing
 * stops being a payer. Clamped to the bill, which may have shrunk since they
 * typed.
 *
 * @param userId - Who paid.
 * @param paidCents - How much; 0 takes them off.
 * @returns The edit.
 */
export function setPaid(userId: string, paidCents: number): LiveEdit {
  return (state) => {
    const others = Object.fromEntries(Object.entries(state.payers).filter(([payerId]) => payerId !== userId));
    // Somebody has to have paid: the last person who did covers the bill.
    if (Object.keys(others).length === 0) return withFittedPayers({ ...state, payers: { [userId]: state.amountCents } });
    const mine = Math.min(paidCents, state.amountCents);
    return withFittedPayers({
      ...state,
      payers: { ...fitPayers(others, state.amountCents - mine), ...(mine > 0 ? { [userId]: mine } : {}) },
    });
  };
}

/** A check of what somebody typed for what they paid. */
export interface PaidCheck {
  /** The amount; 0 when it cannot be saved. */
  cents: number;
  /** Why not, for beside the field; "" when there is nothing to say yet. */
  message: string;
}

/**
 * Checks what somebody typed for what they paid.
 *
 * @param text - What they typed.
 * @param state - The bill.
 * @param currency - ISO 4217 code it is typed in.
 * @returns The amount, or why it will not do.
 */
export function checkPaidAmount(text: string, state: ExpenseState, currency: string): PaidCheck {
  if (text.trim() === "") return { cents: 0, message: "" };
  const cents = parseMoneyInput(text, currency) ?? 0;
  if (cents <= 0) return { cents: 0, message: LIVE_PAID_AMOUNT_MESSAGE };
  if (cents > state.amountCents) return { cents: 0, message: paidTooMuchMessage(formatMoney(state.amountCents, currency)) };
  return { cents, message: "" };
}

/** Somebody who paid, as one person looking at the bill sees them. */
export interface LivePayer {
  userId: string;
  /** What they paid. */
  paidCents: number;
  /** What the person looking owes them for this bill, by the rule the ledger uses. */
  owedCents: number;
}

/**
 * Who paid, most first, and what one person owes each of them. With several
 * payers a debt runs to particular people, which is why Settle sits beside
 * each payer.
 *
 * @param state - The bill.
 * @param userId - Who is looking.
 * @returns One row per payer.
 */
export function livePayers(state: ExpenseState, userId: string): LivePayer[] {
  const debts = expenseDebts(
    Object.entries(state.payers).map(([payerId, amountCents]) => ({ userId: payerId, amountCents })),
    Object.entries(state.owed).map(([owerId, amountCents]) => ({ userId: owerId, amountCents })),
  );
  return Object.entries(state.payers)
    .sort(([firstId, firstCents], [secondId, secondCents]) => secondCents - firstCents || firstId.localeCompare(secondId))
    .map(([payerId, paidCents]) => ({
      userId: payerId,
      paidCents,
      owedCents: debts.find((debt) => debt.from === userId && debt.to === payerId)?.amountCents ?? 0,
    }));
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
  /** What this person's part of the bill comes to, tax and tip included. */
  myShareCents: number;
  /** What this person paid towards it. */
  myPaidCents: number;
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
  const unclaimed = state.lines.filter((line) => Object.keys(line.shares).length === 0);
  return {
    myShareCents: state.owed[userId] ?? 0,
    myPaidCents: state.payers[userId] ?? 0,
    unclaimedCents: unclaimed.reduce((running, line) => running + line.totalCents, 0),
    unclaimedLines: unclaimed.length,
  };
}

/** Where one person stands, by the balance: what a bill alone cannot say, since it does not know who has paid. */
export interface LiveStanding {
  /** Nothing is pending between them and anybody on the expense, either way. */
  settledForViewer: boolean;
  /** Everyone they still owe in the expense's scope. */
  owedUserIds: readonly string[];
}

/** The headline figure of a live split, for one person. */
export interface LiveTotal {
  /** What the figure is. */
  label: string;
  /** The figure. */
  cents: number;
  /** Whether it is a share still to pay rather than money this person is out of pocket or has dealt with. */
  owing: boolean;
}

/**
 * Works out the headline figure for one person. Whoever covered more than
 * their share has it settled once nobody on the bill owes them; anybody else,
 * once they owe nobody.
 *
 * @param state - The expense.
 * @param userId - Who is looking.
 * @param standing - Where they stand; see {@link withSavedEdit} for why it can go out of date.
 * @returns The figure and what it means.
 */
export function liveTotal(state: ExpenseState, userId: string, standing: LiveStanding): LiveTotal {
  const { myPaidCents, myShareCents } = liveSummary(state, userId);
  const coveredCents = myPaidCents - myShareCents;
  if (coveredCents > 0) {
    return {
      label: standing.settledForViewer ? LIVE_EVERYONE_SETTLED_LABEL : LIVE_COVERED_LABEL,
      cents: coveredCents,
      owing: false,
    };
  }
  const paidUp = standing.owedUserIds.length === 0;
  const stillToPay = myPaidCents < myShareCents;
  return {
    label: stillToPay && paidUp ? LIVE_SHARE_SETTLED_LABEL : LIVE_MY_SHARE_LABEL,
    cents: myShareCents,
    owing: stillToPay && !paidUp,
  };
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

/** What one person owes for a bill alone, which says when the balance is worth reading. */
export interface BillDebts {
  /** Who they owe for this bill. */
  payerIds: string[];
  /** Changes only when what they owe does; "" when they owe nothing for it. */
  key: string;
}

/**
 * What one person owes for a bill. A bill is reread on every tap at the
 * table, while the balance behind it only matters to somebody who owes on the
 * bill and only moves for them when that debt does: anything else would have
 * everyone's phone read it for everyone else's tap.
 *
 * @param state - The bill.
 * @param userId - Who is looking.
 * @returns Who they owe, and a key for it.
 */
export function billDebts(state: ExpenseState, userId: string): BillDebts {
  const owed = livePayers(state, userId).filter((payer) => payer.owedCents > 0);
  return {
    payerIds: owed.map((payer) => payer.userId),
    key: owed.map((payer) => `${payer.userId}:${payer.owedCents}`).join(","),
  };
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
