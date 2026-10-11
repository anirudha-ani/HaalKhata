/**
 * Wording both apps show around payment methods, kept in one place so the
 * web and the mobile app cannot drift apart on it.
 *
 * One rule runs through every example here: this is mainly a US product, so
 * an example leads with what people in the US use (Venmo, Zelle, a bank
 * account). bKash and UPI are named, because the people who use them should
 * recognise themselves, but never first.
 */

/** Shown in the "Get paid" list while it is empty. */
export const EMPTY_METHODS_HINT =
  "Nothing here yet. Add Venmo, Zelle, a bank account, bKash, UPI, or whatever you use.";

/** Placeholder of the method name field, for the starting points that leave the name blank. */
export const METHOD_NAME_PLACEHOLDER = "What you call it: Chase checking, bKash…";

/** Placeholder of the note to the payer: an instruction a payer could actually need. */
export const METHOD_NOTE_PLACEHOLDER = "Send as friends and family";

/** Placeholder of the label of a custom detail. */
export const CUSTOM_LABEL_PLACEHOLDER = "What is it called? Branch, Sort code, IFSC…";

/**
 * The label of the button that ends onboarding on the payment step.
 *
 * It says what pressing it does in the state the screen is in. With nothing
 * added, leaving is skipping, and the button says so instead of reading as
 * though the step had been completed.
 *
 * @param hasMethods - Whether the person has added at least one payment method.
 * @returns "Open your HaalKhata", or "Skip and open your HaalKhata".
 */
export function finishOnboardingLabel(hasMethods: boolean): string {
  return hasMethods ? "Open your HaalKhata" : "Skip and open your HaalKhata";
}

/**
 * The line beside the save button when the form cannot be saved yet. The
 * button is always on screen; the field with the problem may be scrolled
 * out of sight, and a button that does nothing when pressed reads as broken.
 *
 * @param problem - The first problem, as the validator words it.
 * @returns "Not saved yet: give this method a name."
 */
export function notSavedLine(problem: string): string {
  return `Not saved yet: ${problem}.`;
}
