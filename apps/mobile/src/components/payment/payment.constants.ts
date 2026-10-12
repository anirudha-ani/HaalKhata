/** Constants for the payment method components. */

/**
 * The keyboard each kind of payment detail is typed with. A phone has its
 * own field and an account type is a choice, so neither is listed.
 */
export const DETAIL_KEYBOARDS = {
  text: "default",
  email: "email-address",
  number: "number-pad",
  link: "url",
} as const;
