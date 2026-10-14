/**
 * The shapes payment methods take in the shared helpers. Structural on
 * purpose: the generated proto messages, the server's rows once mapped, and
 * a form's draft all satisfy them, so one implementation serves all three.
 */

/** One labelled identifier of a payment method. */
export interface PaymentDetailFields {
  /** A key from DETAIL_KINDS, e.g. "phone" or "account_number". */
  kind: string;
  /** The owner's own label; used only when kind is "custom". */
  label: string;
  /** The identifier itself. */
  value: string;
}

/** Everything about a payment method that its owner types. */
export interface PaymentMethodFields {
  /** What the owner calls it. */
  name: string;
  /** ISO 4217 code the method works in; "" means any currency. */
  currency: string;
  /** venmo | zelle | cashapp | paypal, or "" for a method the person defined. */
  preset: string;
  /** What the payer needs, in the owner's order. */
  details: readonly PaymentDetailFields[];
  /** Optional instruction for the payer. */
  note: string;
}
