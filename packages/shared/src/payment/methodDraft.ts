/** The add-and-edit form's working copy of a payment method, shared by both apps: building it, changing it, and turning it back into what gets validated and sent. */

import { DEFAULT_PHONE_REGION, composeE164, splitE164 } from "../phone/phone";
import { CUSTOM_DETAIL_KIND, DETAIL_KINDS, findDetailKind } from "./detailKinds";
import { MAX_PAYMENT_DETAILS_PER_METHOD } from "./payment.constants";
import { allowedDetailKinds, draftFromTemplate, isPreset } from "./templates";
import type { PaymentDetailFields, PaymentMethodFields } from "./types";

/** One detail row as the form holds it. */
export interface DetailDraft {
  /**
   * Identity of the row for the life of the form. Rows are added, removed
   * and rewritten in place, so neither their index nor their kind can be a
   * list key: either would move one row's typed text onto another.
   */
  rowId: string;
  /** A key from DETAIL_KINDS. */
  kind: string;
  /** The owner's label; shown and kept only for a custom detail. */
  label: string;
  /** The typed value, for every kind except a phone. */
  value: string;
  /** Country of a phone detail, as an ISO 3166-1 alpha-2 code. */
  region: string;
  /** National number of a phone detail, as typed. */
  nationalNumber: string;
}

/** A payment method as the form holds it. */
export interface MethodDraft {
  name: string;
  /** ISO 4217 code; "" means any currency. */
  currency: string;
  /** Built-in app key, or "". Fixed once the method exists. */
  preset: string;
  details: DetailDraft[];
  note: string;
  /** The "preferred" box. */
  preferred: boolean;
}

/** Source of row ids; module state is enough, since ids only need to differ within one form. */
let nextRowNumber = 0;

/**
 * Builds a form row for one detail. A stored phone is split back into the
 * country and national number the phone field edits.
 *
 * @param detail - The detail to edit; pass an empty value for a new row.
 * @returns The row, with a fresh id.
 */
export function detailDraft(detail: PaymentDetailFields): DetailDraft {
  nextRowNumber += 1;
  const split = detail.kind === "phone" ? splitE164(detail.value) : null;
  return {
    rowId: `detail-${nextRowNumber}`,
    kind: detail.kind,
    label: detail.label,
    value: detail.value,
    region: split?.region ?? DEFAULT_PHONE_REGION,
    // A stored value that does not parse (an old handle typed without a
    // country code) is kept as typed, so opening the form never loses it.
    nationalNumber: split?.nationalNumber ?? (detail.kind === "phone" ? detail.value : ""),
  };
}

/**
 * Builds the form's working copy of a method.
 *
 * @param method - A stored method, or a template's empty one.
 * @param preferred - Whether the "preferred" box starts ticked.
 * @returns The draft.
 */
export function methodDraft(method: PaymentMethodFields, preferred: boolean): MethodDraft {
  return {
    name: method.name,
    currency: method.currency,
    preset: method.preset,
    details: method.details.map(detailDraft),
    note: method.note,
    preferred,
  };
}

/**
 * Builds the draft the add form opens with for a starting point.
 *
 * @param templateKey - Which starting point was picked.
 * @param defaultCurrency - The person's default currency.
 * @returns An empty draft shaped by the template.
 */
export function templateDraft(templateKey: string, defaultCurrency: string): MethodDraft {
  return methodDraft(draftFromTemplate(templateKey, defaultCurrency), false);
}

/**
 * The value a row stands for: a phone's two halves joined into E.164, any
 * other kind's typed text.
 *
 * @param detail - The form row.
 * @returns The value to validate and send.
 */
export function detailDraftValue(detail: DetailDraft): string {
  return detail.kind === "phone" ? composeE164(detail.region, detail.nationalNumber) : detail.value;
}

/**
 * Turns the form's draft back into the plain fields the validator checks.
 * Rows keep their order, so an error keyed by index there is the error of
 * the row at that index here.
 *
 * @param draft - The form's working copy.
 * @returns The method as typed.
 */
export function draftFields(draft: MethodDraft): PaymentMethodFields {
  return {
    name: draft.name,
    currency: draft.currency,
    preset: draft.preset,
    details: draft.details.map((detail) => ({
      kind: detail.kind,
      label: detail.label,
      value: detailDraftValue(detail),
    })),
    note: draft.note,
  };
}

/**
 * Switches a row to another kind. What was typed is carried over only
 * between kinds that are both plain text; a phone number is not an email,
 * and an account type is a choice, so anything else starts empty.
 *
 * @param detail - The row being changed.
 * @param kindKey - The kind picked.
 * @returns The row as it should now be.
 */
export function withDetailKind(detail: DetailDraft, kindKey: string): DetailDraft {
  if (kindKey === detail.kind) return detail;
  const plainText = (candidate: string) => findDetailKind(candidate)?.input === "text";
  const keepsValue = plainText(detail.kind) && plainText(kindKey);
  return {
    ...detail,
    kind: kindKey,
    label: kindKey === CUSTOM_DETAIL_KIND ? detail.label : "",
    value: keepsValue ? detail.value : "",
    nationalNumber: "",
  };
}

/**
 * The kinds a row of this method may be switched between.
 *
 * @param preset - The method's preset key, or "".
 * @returns Kind keys in picker order: the built-in app's few, or every kind.
 */
export function selectableDetailKinds(preset: string): readonly string[] {
  const allowed = allowedDetailKinds(preset);
  return allowed.length > 0 ? allowed : DETAIL_KINDS.map((detailKind) => detailKind.key);
}

/**
 * Whether the form should offer "Add another detail".
 *
 * @param draft - The form's working copy.
 * @returns False for a built-in app, which takes exactly one, and at the cap.
 */
export function canAddDetail(draft: MethodDraft): boolean {
  return !isPreset(draft.preset) && draft.details.length < MAX_PAYMENT_DETAILS_PER_METHOD;
}

/**
 * The kind a newly added row starts on: the first the method allows that it
 * does not already have, so "Add another detail" on a bank form does not
 * offer a second account number.
 *
 * @param draft - The form's working copy.
 * @returns A kind key.
 */
export function nextDetailKind(draft: MethodDraft): string {
  const used = new Set(draft.details.map((detail) => detail.kind));
  const kinds = selectableDetailKinds(draft.preset);
  return kinds.find((kindKey) => !used.has(kindKey)) ?? CUSTOM_DETAIL_KIND;
}
