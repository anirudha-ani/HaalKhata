/** One validator for a payment method: the clients run it for inline errors, the server runs it as the authority. */

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { currencyInfo } from "../money/money.constants";
import { stripHiddenCharacters } from "../text/hiddenCharacters";
import {
  MAX_PAYMENT_DETAIL_LABEL_LENGTH,
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_PAYMENT_METHOD_NOTE_LENGTH,
} from "../text/limits";
import { ACCOUNT_TYPES, CUSTOM_DETAIL_KIND, findDetailKind } from "./detailKinds";
import { findPaymentMethod, stripHandlePrefix } from "./methods";
import {
  ACCOUNT_NUMBER_PATTERN,
  CONTROL_CHARACTER_PATTERN,
  DIGIT_PATTERN,
  HTTPS_LINK_PATTERN,
  IBAN_PATTERN,
  MAX_ECHOED_CHARACTERS,
  MAX_PAYMENT_DETAILS_PER_METHOD,
  MAX_RAW_DETAIL_ROWS,
  MAX_RAW_FIELD_LENGTH,
  PAYMENT_EMAIL_PATTERN,
  ROUTING_NUMBER_PATTERN,
  SECRET_REFUSAL,
  SWIFT_PATTERN,
} from "./payment.constants";
import { namesSecret } from "./secrets";
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
 * Whether a field is too long to be worth reading. Checked on the text as it
 * arrived, before it is trimmed or matched against anything, so the work
 * done on a field never depends on how much of it someone chose to send.
 *
 * @param typed - The field as it arrived.
 * @returns True when the field must be refused unread.
 */
function oversized(typed: string): boolean {
  return typed.length > MAX_RAW_FIELD_LENGTH;
}

/**
 * A field of words as it is read: hidden characters removed, then trimmed.
 * Removed first, so that text made only of them counts as the blank it is.
 *
 * @param typed - The field as it arrived, already known not to be oversized.
 * @returns What a reader would see of it.
 */
function readWords(typed: string): string {
  return stripHiddenCharacters(typed, true).trim();
}

/**
 * A refused value as an error message may repeat it: its first few
 * characters, so the message stays one line whatever was sent.
 *
 * @param refused - The value being quoted back.
 * @returns The value, cut short with an ellipsis when it is long.
 */
function echoed(refused: string): string {
  return refused.length > MAX_ECHOED_CHARACTERS
    ? `${refused.slice(0, MAX_ECHOED_CHARACTERS)}…`
    : refused;
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
  if (
    kindKey === "account_number" &&
    !(ACCOUNT_NUMBER_PATTERN.test(typed) && DIGIT_PATTERN.test(typed))
  ) {
    return {
      value: typed,
      error: "an account number is digits and letters, with spaces, dashes, dots or slashes between them",
    };
  }
  if (
    kindKey === "routing_number" &&
    !(ROUTING_NUMBER_PATTERN.test(typed) && DIGIT_PATTERN.test(typed))
  ) {
    return {
      value: typed,
      error: "a routing number is digits and letters, with spaces or dashes between them",
    };
  }
  return { value: typed };
}

/**
 * Cleans and checks the label of a custom detail.
 *
 * @param typed - The label as it arrived.
 * @returns The reason it was refused, or undefined when it is fine.
 */
function checkCustomLabel(typed: string): string | undefined {
  if (oversized(typed)) {
    return `keep the label under ${MAX_PAYMENT_DETAIL_LABEL_LENGTH} characters`;
  }
  const label = readWords(typed);
  if (label === "") return "give this detail a label";
  if (CONTROL_CHARACTER_PATTERN.test(label)) return "remove the line break";
  if (label.length > MAX_PAYMENT_DETAIL_LABEL_LENGTH) {
    return `keep the label under ${MAX_PAYMENT_DETAIL_LABEL_LENGTH} characters`;
  }
  if (namesSecret(label)) return SECRET_REFUSAL;
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
  const tooManyDetails = `a method can have at most ${MAX_PAYMENT_DETAILS_PER_METHOD} details`;

  // Every field is measured before it is read. A request can be megabytes
  // long, and trimming, matching or parsing that much is work one caller
  // would be making the whole server do.
  const name = oversized(draft.name) ? "" : readWords(draft.name);
  if (oversized(draft.name)) {
    errors.name = `keep the name under ${MAX_PAYMENT_METHOD_NAME_LENGTH} characters`;
  } else if (name === "") errors.name = "give this method a name";
  else if (CONTROL_CHARACTER_PATTERN.test(name)) errors.name = "remove the line break";
  else if (name.length > MAX_PAYMENT_METHOD_NAME_LENGTH) {
    errors.name = `keep the name under ${MAX_PAYMENT_METHOD_NAME_LENGTH} characters`;
  } else if (namesSecret(name)) errors.name = SECRET_REFUSAL;

  const currency = oversized(draft.currency) ? "" : draft.currency.trim().toUpperCase();
  if (oversized(draft.currency)) errors.currency = "choose a currency from the list";
  else if (currency !== "" && !currencyInfo(currency)) {
    errors.currency = `${echoed(currency)} is not a currency this app knows`;
  }

  const preset = oversized(draft.preset) ? "" : draft.preset.trim();
  if (oversized(draft.preset)) errors.preset = "unknown payment app";
  else if (preset !== "" && !isPreset(preset)) {
    errors.preset = `unknown payment app "${echoed(preset)}"`;
  }

  const note = oversized(draft.note) ? "" : readWords(draft.note);
  if (oversized(draft.note)) {
    errors.note = `keep the note under ${MAX_PAYMENT_METHOD_NOTE_LENGTH} characters`;
  } else if (CONTROL_CHARACTER_PATTERN.test(note)) errors.note = "keep the note to one line";
  else if (note.length > MAX_PAYMENT_METHOD_NOTE_LENGTH) {
    errors.note = `keep the note under ${MAX_PAYMENT_METHOD_NOTE_LENGTH} characters`;
  }

  const allowedKinds = allowedDetailKinds(preset);
  const presetLabel = findPaymentMethod(preset)?.label ?? preset;
  const details: PaymentDetailFields[] = [];
  // More rows than any form can send are refused without being read; the
  // rows themselves are what would cost the time.
  const rows = draft.details.length > MAX_RAW_DETAIL_ROWS ? [] : draft.details;
  rows.forEach((detail, draftIndex) => {
    const kindKey = detail.kind;
    if (oversized(detail.value)) {
      const maxLength = findDetailKind(kindKey)?.maxLength ?? MAX_RAW_FIELD_LENGTH;
      errors.detailRows[draftIndex] = `keep this under ${maxLength} characters`;
      return;
    }
    // Words keep the joiners their script needs; an identifier, which is
    // what gets copied into a bank app, keeps nothing a reader cannot see.
    const visible = stripHiddenCharacters(detail.value, findDetailKind(kindKey)?.prose ?? false);
    // A built-in app stores the bare identifier; its sigil is furniture.
    const typed = isPreset(preset) ? stripHandlePrefix(preset, visible) : visible.trim();
    if (typed === "") return;

    if (!findDetailKind(kindKey)) {
      errors.detailRows[draftIndex] = `unknown kind of detail "${echoed(kindKey)}"`;
      return;
    }
    if (allowedKinds.length > 0 && !allowedKinds.includes(kindKey)) {
      errors.detailRows[draftIndex] = `${presetLabel} does not take this kind of detail`;
      return;
    }
    // A built-in app's link is built from its username, so the username has
    // to be one the app could have issued.
    const builtIn = findPaymentMethod(preset);
    if (kindKey === "username" && builtIn?.handlePattern && !builtIn.handlePattern.test(typed)) {
      errors.detailRows[draftIndex] =
        typed.length > (findDetailKind(kindKey)?.maxLength ?? 0)
          ? `keep this under ${findDetailKind(kindKey)?.maxLength ?? 0} characters`
          : (builtIn.handleRule ?? `${presetLabel} does not take this username`);
      return;
    }
    const isCustom = kindKey === CUSTOM_DETAIL_KIND;
    const label = isCustom && !oversized(detail.label) ? readWords(detail.label) : "";
    const labelError = isCustom ? checkCustomLabel(detail.label) : undefined;
    const outcome = checkDetailValue(kindKey, typed);
    const rowError = labelError ?? outcome.error;
    if (rowError) errors.detailRows[draftIndex] = rowError;
    details.push({ kind: kindKey, label, value: outcome.value });
  });

  if (draft.details.length > MAX_RAW_DETAIL_ROWS) errors.details = tooManyDetails;
  else if (details.length === 0 && Object.keys(errors.detailRows).length === 0) {
    errors.details = "add at least one detail a payer can use";
  } else if (details.length > MAX_PAYMENT_DETAILS_PER_METHOD) {
    errors.details = tooManyDetails;
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
