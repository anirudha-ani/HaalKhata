/** Wording for the member actions that ask first, and for the one the ledger can refuse — shared so both clients say the same thing. */

import { formatMoney } from "../money/money";

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

/**
 * Explains why somebody cannot leave or be removed while their balance in the
 * group is unsettled.
 *
 * The server refuses a removal unless the member's net in the group is
 * exactly zero, and a client holding the group's balances knows that before
 * it asks. Saying so up front, with the amount, replaces sending a request
 * that can only fail and then reporting the failure.
 *
 * @param personName - Display name of the member.
 * @param isSelf - Whether that member is the person asking, i.e. leaving.
 * @param netCents - The member's net in the group; > 0 means they are owed
 *   money, < 0 means they owe it.
 * @param currency - The group's ISO 4217 currency code.
 * @returns The refusal in words, or null when the balance is settled and the
 *   removal can go ahead.
 */
export function memberRemovalBlock(
  personName: string,
  isSelf: boolean,
  netCents: number,
  currency: string,
): MemberRemovalBlock | null {
  if (netCents === 0) return null;
  const amount = formatMoney(Math.abs(netCents), currency);
  const owes = netCents < 0;
  if (isSelf) {
    return {
      title: "You can't leave this group yet",
      detail: owes
        ? `You owe ${amount} here. Settle up first, then you can leave.`
        : `You are owed ${amount} here. Once that is settled you can leave.`,
    };
  }
  return {
    title: `${personName} can't be removed yet`,
    detail: owes
      ? `They owe ${amount} in this group. That has to be settled first.`
      : `They are owed ${amount} in this group. That has to be settled first.`,
  };
}
