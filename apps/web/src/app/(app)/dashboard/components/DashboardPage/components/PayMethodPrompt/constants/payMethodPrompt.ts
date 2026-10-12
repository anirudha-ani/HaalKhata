/** Constants for the Home prompt to add a payment method. */

/**
 * sessionStorage key remembering that the prompt was dismissed. Per session,
 * like the phone prompt: "Not now" should not mean "never", because the
 * people who owe are still waiting to be told where to send it.
 */
export const PAY_PROMPT_DISMISS_KEY = "hk.payMethodPrompt.dismissed";
