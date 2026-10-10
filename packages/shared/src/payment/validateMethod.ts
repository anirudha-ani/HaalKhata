/** One validator for a payment method: the clients run it for inline errors, the server runs it as the authority. */

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { currencyInfo } from "../money/money.constants";
import {
  MAX_PAYMENT_DETAIL_LABEL_LENGTH,
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_PAYMENT_METHOD_NOTE_LENGTH,
} from "../text/limits";
import { ACCOUNT_TYPES, CUSTOM_DETAIL_KIND, findDetailKind } from "./detailKinds";
import { findPaymentMethod, stripHandlePrefix } from "./methods";
import {
  CONTROL_CHARACTER_PATTERN,
  HTTPS_LINK_PATTERN,
  IBAN_PATTERN,
  MAX_PAYMENT_DETAILS_PER_METHOD,
  PAYMENT_EMAIL_PATTERN,
  SECRET_LABEL_PATTERN,
  SWIFT_PATTERN,
} from "./payment.constants";
import { allowedDetailKinds, isPreset } from "./templates";
import type { PaymentDetailFields, PaymentMethodFields } from "./types";

/** What is wrong with a payment method, field by field. */
export interface PaymentMethodErrors {
  /** Problem with the name. */
  name?: string;
  /** Problem with the currency. */
  currency?: string;
  /** Problem with the preset key; only a hand-built request can cause it. */
  preset?: string;
  /** Problem with the note. */
  note?: string;
  /** Problem with the list of details as a whole: none filled in, or too many. */
  details?: string;
  /**
   * Problem with one detail, keyed by its index in the draft that was
   * checked, so a form can show it under the row that caused it.
   */
  detailRows: Record<number, string>;
}

/** The outcome of checking a payment method. */
export interface PaymentMethodCheck {
  /**
   * The method as it should be sent or stored: trimmed, blank rows dropped,
   * values normalized. Only meaningful when `valid` is true.
   */
  method: PaymentMethodFields;
  /** Every problem found; empty when `valid` is true. */
  errors: PaymentMethodErrors;
  /** Whether the method can be saved as it stands. */
  valid: boolean;
}

/** A detail's value after cleaning, or the reason it cannot be accepted. */
interface DetailOutcome {
  /** The value to store. */
  value: string;
  /** Why the value was refused; absent when it is fine. */
  error?: string;
}

/**
 * Cleans and checks one detail's value for its kind.
 *
 * The checks are light on purpose. This app cannot know whether an account
 * number is real, so it only refuses what cannot be right in any country.
 *
 * @param kindKey - The detail's kind.
 * @param typed - The value as typed, already trimmed.
 * @returns The value to store, or the reason it was refused.
 */
function checkDetailValue(kindKey: string, typed: string): DetailOutcome {
  if (CONTROL_CHARACTER_PATTERN.test(typed)) {
    return { value: typed, error: "remove the line break" };
  }
  const maxLength = findDetailKind(kindKey)?.maxLength ?? 0;
  if (typed.length > maxLength) {
    return { value: typed, error: `keep this under ${maxLength} characters` };
  }
  if (kindKey === "phone") {
    // No default region: a payer may be in another country, so the number
    // has to carry its own country code to mean anything to them.
    const parsed = parsePhoneNumberFromString(typed);
    if (!parsed || !parsed.isValid()) {
      return { value: typed, error: "enter a valid phone number with its country code" };
    }
    return { value: parsed.number };
  }
  if (kindKey === "email" && !PAYMENT_EMAIL_PATTERN.test(typed)) {
    return { value: typed, error: "enter a valid email address" };
  }
  if (kindKey === "account_type" && !ACCOUNT_TYPES.some((accountType) => accountType.key === typed)) {
    return { value: typed, error: "choose checking, savings or current" };
  }
  if (kindKey === "swift" || kindKey === "iban") {
    // Printed with spaces, typed either way: store the one compact spelling.
    const compact = typed.replace(/\s+/g, "").toUpperCase();
    if (kindKey === "swift" && !SWIFT_PATTERN.test(compact)) {
      return { value: compact, error: "a SWIFT code is 8 or 11 letters and digits" };
    }
    if (kindKey === "iban" && !IBAN_PATTERN.test(compact)) {
      return { value: compact, error: "an IBAN is 15 to 34 letters and digits" };
    }
    return { value: compact };
  }
  if (kindKey === "link" && !HTTPS_LINK_PATTERN.test(typed)) {
    return { value: typed, error: "enter a link that starts with https://" };
  }
  return { value: typed };
}

/**
 * Cleans and checks the label of a custom detail.
 *
 * @param typed - The label as typed, already trimmed.
 * @returns The reason it was refused, or undefined when it is fine.
 */
function checkCustomLabel(typed: string): string | undefined {
  if (typed === "") return "give this detail a label";
  if (CONTROL_CHARACTER_PATTERN.test(typed)) return "remove the line break";
  if (typed.length > MAX_PAYMENT_DETAIL_LABEL_LENGTH) {
    return `keep the label under ${MAX_PAYMENT_DETAIL_LABEL_LENGTH} characters`;
  }
  if (SECRET_LABEL_PATTERN.test(typed)) {
    return "never share a PIN, password or card security code here";
  }
  return undefined;
}

/**
 * Checks a payment method and returns the cleaned version to save.
 *
 * Rows with a blank value are dropped before anything else, so a starting
 * point with six bank fields can be saved with the three a person's bank
 * actually needs. Errors on the rows that remain are keyed by each row's
 * index in the draft passed in, not its index after dropping.
 *
 * @param draft - The method as typed in a form, or as received by the server.
 * @returns The cleaned method, the problems found, and whether it can be saved.
 */
export function checkPaymentMethod(draft: PaymentMethodFields): PaymentMethodCheck {
  const errors: PaymentMethodErrors = { detailRows: {} };

  const name = draft.name.trim();
  if (name === "") errors.name = "give this method a name";
  else if (CONTROL_CHARACTER_PATTERN.test(name)) errors.name = "remove the line break";
  else if (name.length > MAX_PAYMENT_METHOD_NAME_LENGTH) {
    errors.name = `keep the name under ${MAX_PAYMENT_METHOD_NAME_LENGTH} characters`;
  }

  const currency = draft.currency.trim().toUpperCase();
  if (currency !== "" && !currencyInfo(currency)) {
    errors.currency = `${currency} is not a currency this app knows`;
  }

  const preset = draft.preset.trim();
  if (preset !== "" && !isPreset(preset)) errors.preset = `unknown payment app "${preset}"`;

  const note = draft.note.trim();
  if (CONTROL_CHARACTER_PATTERN.test(note)) errors.note = "keep the note to one line";
  else if (note.length > MAX_PAYMENT_METHOD_NOTE_LENGTH) {
    errors.note = `keep the note under ${MAX_PAYMENT_METHOD_NOTE_LENGTH} characters`;
  }

  const allowedKinds = allowedDetailKinds(preset);
  const presetLabel = findPaymentMethod(preset)?.label ?? preset;
  const details: PaymentDetailFields[] = [];
  draft.details.forEach((detail, draftIndex) => {
    const kindKey = detail.kind;
    // A built-in app stores the bare identifier; its sigil is furniture.
    const typed = isPreset(preset)
      ? stripHandlePrefix(preset, detail.value)
      : detail.value.trim();
    if (typed === "") return;

    if (!findDetailKind(kindKey)) {
      errors.detailRows[draftIndex] = `unknown kind of detail "${kindKey}"`;
      return;
    }
    if (allowedKinds.length > 0 && !allowedKinds.includes(kindKey)) {
      errors.detailRows[draftIndex] = `${presetLabel} does not take this kind of detail`;
      return;
    }
    const label = kindKey === CUSTOM_DETAIL_KIND ? detail.label.trim() : "";
    const labelError = kindKey === CUSTOM_DETAIL_KIND ? checkCustomLabel(label) : undefined;
    const outcome = checkDetailValue(kindKey, typed);
    const rowError = labelError ?? outcome.error;
    if (rowError) errors.detailRows[draftIndex] = rowError;
    details.push({ kind: kindKey, label, value: outcome.value });
  });

  if (details.length === 0 && Object.keys(errors.detailRows).length === 0) {
    errors.details = "add at least one detail a payer can use";
  } else if (details.length > MAX_PAYMENT_DETAILS_PER_METHOD) {
    errors.details = `a method can have at most ${MAX_PAYMENT_DETAILS_PER_METHOD} details`;
  } else if (isPreset(preset) && details.length > 1) {
    // Its link is built from one identifier; a second has nowhere to go.
    errors.details = `${presetLabel} takes a single detail`;
  }

  const valid =
    errors.name === undefined &&
    errors.currency === undefined &&
    errors.preset === undefined &&
    errors.note === undefined &&
    errors.details === undefined &&
    Object.keys(errors.detailRows).length === 0;

  return { method: { name, currency, preset, details, note }, errors, valid };
}

/**
 * Picks the one message to show when only one can be shown, in the order the
 * form reads: name, currency, details, note.
 *
 * @param errors - The problems a check found.
 * @returns The first message, or "" when there is none.
 */
export function firstPaymentMethodError(errors: PaymentMethodErrors): string {
  const firstRow = Object.keys(errors.detailRows)
    .map(Number)
    .sort((left, right) => left - right)[0];
  return (
    errors.name ??
    errors.currency ??
    errors.preset ??
    errors.details ??
    (firstRow === undefined ? undefined : errors.detailRows[firstRow]) ??
    errors.note ??
    ""
  );
}
