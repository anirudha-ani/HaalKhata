/** Confirmation wording for the member actions that ask first — shared so both clients ask the same question. */

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
