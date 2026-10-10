/** The kinds of detail a payment method can carry, and how each is labelled and edited. */

import { MAX_PAYMENT_DETAIL_VALUE_LENGTH, MAX_PAYMENT_LINK_LENGTH } from "../text/limits";
import type { PaymentDetailFields } from "./types";

/**
 * Which control a detail's value is edited with. Each app maps it to its own
 * keyboard: `inputMode` on the web, `keyboardType` in React Native.
 */
export type DetailInput = "text" | "phone" | "email" | "number" | "link" | "choice";

/** One kind of detail. */
export interface DetailKind {
  /** Stable key stored with the detail. */
  key: string;
  /** Label shown beside the value. Empty for the custom kind, which takes the owner's own. */
  label: string;
  /**
   * A worked example of the value, shown as the placeholder. An example
   * rather than a description, because the question is what to type.
   */
  example: string;
  /** The control the value is edited with. */
  input: DetailInput;
  /** Longest value accepted. */
  maxLength: number;
  /**
   * Whether the owner's own list shows only the value's last characters.
   * The list sits on screen far more often than it is read, and an account
   * number does not need to be legible over a shoulder.
   */
  masked: boolean;
}

/** Key of the one kind whose label the owner types. */
export const CUSTOM_DETAIL_KIND = "custom";

/**
 * Every kind of detail, in the order the picker offers them.
 *
 * The set is closed and small on purpose. Anything country-specific (an IFSC,
 * a sort code, a branch) is a custom detail with its own label, which is what
 * keeps this list from growing a row per country. The database CHECK on
 * payment_method_details.kind lists the same keys.
 */
export const DETAIL_KINDS: readonly DetailKind[] = [
  {
    key: "phone",
    label: "Phone number",
    example: "",
    input: "phone",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "email",
    label: "Email",
    example: "jordan@example.com",
    input: "email",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "username",
    label: "Username or ID",
    example: "jordan-lee",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "account_name",
    label: "Account holder name",
    example: "Jordan Lee",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "bank_name",
    label: "Bank name",
    example: "",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "account_type",
    label: "Account type",
    example: "",
    input: "choice",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "account_number",
    label: "Account number",
    example: "000123456789",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: true,
  },
  {
    key: "routing_number",
    label: "Routing number",
    example: "000000000",
    input: "number",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "swift",
    label: "SWIFT / BIC",
    example: "ABCDUS33",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
  {
    key: "iban",
    label: "IBAN",
    example: "",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: true,
  },
  {
    key: "link",
    label: "Payment link",
    example: "https://",
    input: "link",
    maxLength: MAX_PAYMENT_LINK_LENGTH,
    masked: false,
  },
  {
    key: CUSTOM_DETAIL_KIND,
    label: "",
    example: "",
    input: "text",
    maxLength: MAX_PAYMENT_DETAIL_VALUE_LENGTH,
    masked: false,
  },
];

/** Just the kind keys, for validation. */
export const DETAIL_KIND_KEYS = DETAIL_KINDS.map((detailKind) => detailKind.key);

/** What the picker calls the custom kind, which has no label of its own. */
export const CUSTOM_DETAIL_PICKER_LABEL = "Other";

/** One choice of the account-type detail. */
export interface AccountType {
  /** Stored value. */
  key: string;
  /** Name shown in the picker and to the payer. */
  label: string;
}

/**
 * The account types offered. "Current" is what most of the world calls a
 * checking account, and a payer's bank form asks for whichever word its own
 * country uses, so both are here.
 */
export const ACCOUNT_TYPES: readonly AccountType[] = [
  { key: "checking", label: "Checking" },
  { key: "savings", label: "Savings" },
  { key: "current", label: "Current" },
];

/**
 * Looks up a kind of detail by key.
 *
 * @param kindKey - Kind key, e.g. "phone".
 * @returns The kind, or undefined for an unknown key.
 */
export function findDetailKind(kindKey: string): DetailKind | undefined {
  return DETAIL_KINDS.find((detailKind) => detailKind.key === kindKey);
}

/**
 * The label to show beside a detail's value: the owner's own for a custom
 * detail, the catalog's for every other kind.
 *
 * @param detail - The detail being shown.
 * @returns Its label; the raw kind key when the kind is unknown, so a detail
 *   written by a newer client still shows something.
 */
export function detailLabel(detail: PaymentDetailFields): string {
  if (detail.kind === CUSTOM_DETAIL_KIND) return detail.label;
  return findDetailKind(detail.kind)?.label ?? detail.kind;
}

/**
 * The value as a person should read it. Only an account type differs from
 * what is stored: its key ("checking") becomes its name ("Checking").
 *
 * @param detail - The detail being shown.
 * @returns The readable value.
 */
export function detailValueText(detail: PaymentDetailFields): string {
  if (detail.kind !== "account_type") return detail.value;
  return ACCOUNT_TYPES.find((accountType) => accountType.key === detail.value)?.label ?? detail.value;
}
