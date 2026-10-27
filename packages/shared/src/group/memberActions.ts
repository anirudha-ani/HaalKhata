/** Wording for the member actions that ask first, and for the one the ledger can refuse — shared so both clients say the same thing. */

import { amountsInWords, type CurrencyBucket } from "../money/balances";
import { formatMoney } from "../money/money";
import { listInWords } from "../text/listInWords";

/**
 * The member actions that wait for a second, deliberate tap: taking someone
 * out of a group (yourself included) and handing the group to someone else.
 */
export type MemberAction = "remove" | "transfer";

/** What a client shows before a member action goes ahead. */
export interface MemberActionPrompt {
  /** The question, naming whoever it is about. */
  question: string;
  /** One sentence on what going ahead means. */
  detail: string;
  /** Caption of the button that goes ahead. */
  confirmLabel: string;
}

/**
 * Words the confirmation for removing a member, leaving a group, or handing
 * over ownership.
 *
 * Removing and leaving are one RPC with two readings, so they are one action
 * here too and `isSelf` picks the wording. None of the three says the action
 * is permanent, because none is: anyone taken out can be added back, and a
 * new owner can hand the group back. What each does say is who has to do
 * that, which is the part a mis-tap would cost.
 *
 * @param action - What is about to happen.
 * @param personName - Display name of the member it happens to.
 * @param isSelf - Whether that member is the person asking.
 * @returns The question, its consequence, and the confirm button's caption.
 */
export function memberActionPrompt(
  action: MemberAction,
  personName: string,
  isSelf: boolean,
): MemberActionPrompt {
  if (action === "transfer") {
    return {
      question: `Make ${personName} the owner?`,
      detail: "You become a regular member, and only they can hand the group back.",
      confirmLabel: "Make owner",
    };
  }
  if (isSelf) {
    return {
      question: "Leave this group?",
      detail: "You lose access to it until a member adds you back.",
      confirmLabel: "Leave group",
    };
  }
  return {
    question: `Remove ${personName} from the group?`,
    detail: "They lose access to it until a member adds them back.",
    confirmLabel: "Remove",
  };
}

/**
 * What a members list last had to say about an action taken in it: a failure
 * or a confirmation. `userId` names the row it belongs under, so it shows
 * where the tap happened; null means it is about the list as a whole.
 *
 * It exists because a single message printed under the list is off screen in
 * any group long enough to scroll, which made a refused action look like
 * nothing had happened at all.
 */
export interface MemberFeedback {
  /** The member whose row the message belongs under, or null for the whole list. */
  userId: string | null;
  /** Whether the message reports a failure or a success. */
  tone: "error" | "success";
  /** The sentence to show. */
  message: string;
}

/** Why a member cannot be taken out of a group yet. */
export interface MemberRemovalBlock {
  /** The refusal, naming whoever it is about. */
  title: string;
  /** What is outstanding, and what has to happen first. */
  detail: string;
}

/** One debt naming a member, ready to be said: who the other person is, and how much. */
export interface MemberDebtInWords {
  /** ISO 4217 code of the debt. */
  currency: string;
  /** Signed cents: > 0 means the other person owes the member. */
  cents: number;
  /** The other person's display name. */
  counterpartName: string;
  /** Whether the other person is the one reading, who is then "you". */
  counterpartIsViewer?: boolean;
}

/**
 * Explains why somebody cannot leave or be removed while their balance in the
 * group is unsettled.
 *
 * The server refuses a removal unless the member's net in the group is
 * exactly zero in every currency, and a client holding the group's balances
 * knows that before it asks. Saying so up front, with the amounts, replaces
 * sending a request that can only fail and then reporting the failure.
 *
 * A group can hold two currencies (a payment recorded in another before
 * group payments were kept to the group's own), and a dollar owed with a
 * euro paid back is two balances to settle, not one that cancels.
 *
 * A total of zero is not always settled either: in a group that does not
 * simplify debts, someone can owe one person and be owed by another. Then
 * each debt is named, with the way out that needs no payment:
 * Simplify debts routes them around the member.
 *
 * @param personName - Display name of the member.
 * @param isSelf - Whether that member is the person asking, i.e. leaving.
 * @param buckets - The member's net in the group per currency; > 0 means
 *   they are owed money, < 0 means they owe it.
 * @param debts - The debts still naming them (see `memberDebts`), each with
 *   the other person's name, and whether that person is the one reading;
 *   > 0 means that person owes the member.
 * @returns The refusal in words, or null when nothing names them and the
 *   removal can go ahead.
 */
export function memberRemovalBlock(
  personName: string,
  isSelf: boolean,
  buckets: readonly CurrencyBucket[],
  debts: readonly MemberDebtInWords[] = [],
): MemberRemovalBlock | null {
  const owes = amountsInWords(buckets.filter((bucket) => bucket.cents < 0));
  const owed = amountsInWords(buckets.filter((bucket) => bucket.cents > 0));
  if (!owes && !owed) return debtsBlock(personName, isSelf, debts);
  if (isSelf) {
    return {
      title: "You can't leave this group yet",
      detail:
        owes && owed
          ? `You owe ${owes} and are owed ${owed} here. Both have to be settled before you can leave.`
          : owes
            ? `You owe ${owes} here. Settle up first, then you can leave.`
            : `You are owed ${owed} here. Once that is settled you can leave.`,
    };
  }
  return {
    title: `${personName} can't be removed yet`,
    detail:
      owes && owed
        ? `They owe ${owes} and are owed ${owed} in this group. Both have to be settled first.`
        : owes
          ? `They owe ${owes} in this group. That has to be settled first.`
          : `They are owed ${owed} in this group. That has to be settled first.`,
  };
}

/**
 * The refusal for a member whose total is zero but whom debts still name:
 * each debt in words, then why and the way out.
 *
 * @param personName - Display name of the member.
 * @param isSelf - Whether that member is the person asking.
 * @param debts - The debts naming them; > 0 means the other person owes them.
 * @returns The refusal, or null when there are none.
 */
function debtsBlock(
  personName: string,
  isSelf: boolean,
  debts: readonly MemberDebtInWords[],
): MemberRemovalBlock | null {
  if (debts.length === 0) return null;
  const subject = isSelf ? "you" : "they";
  const object = isSelf ? "you" : "them";
  const said = listInWords(
    debts.map((debt) => {
      const amount = formatMoney(Math.abs(debt.cents), debt.currency);
      // The reader is "you" — an owner removing someone they owe or are owed by.
      if (debt.counterpartIsViewer) {
        return debt.cents > 0 ? `you owe ${object} ${amount}` : `${subject} owe you ${amount}`;
      }
      return debt.cents > 0
        ? `${debt.counterpartName} owes ${object} ${amount}`
        : `${subject} owe ${debt.counterpartName} ${amount}`;
    }),
  );
  const sentence = `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
  if (isSelf) {
    return {
      title: "You can't leave this group yet",
      detail: `${sentence} here. Your total is even, but each has to be settled before you can leave — or turn on Simplify debts so they are paid around you.`,
    };
  }
  return {
    title: `${personName} can't be removed yet`,
    detail: `${sentence} in this group. Their total is even, but each has to be settled first — or turn on Simplify debts so they are paid around them.`,
  };
}
