/** One editable "email or phone" contact draft, shared by the add-friend and add-to-group forms. */

import { composeE164, DEFAULT_PHONE_REGION, isValidPhone } from "./phone";

/** Which half of the contact field is active. */
export type ContactMode = "email" | "phone";

/** The state behind an email-or-phone field: one mode, both drafts kept. */
export interface ContactDraft {
  /** Active side of the toggle. */
  mode: ContactMode;
  /** Email as typed; used only in email mode. */
  email: string;
  /** Selected ISO 3166-1 alpha-2 region; used only in phone mode. */
  region: string;
  /** National number as typed; used only in phone mode. */
  nationalNumber: string;
}

/** A fresh, empty draft. Email first: it is the commoner identifier. */
export const EMPTY_CONTACT: ContactDraft = {
  mode: "email",
  email: "",
  region: DEFAULT_PHONE_REGION,
  nationalNumber: "",
};

/**
 * Whether the draft's ACTIVE side holds nothing. The inactive side is
 * ignored on purpose — an abandoned half-typed email must not block a
 * submission made in phone mode.
 *
 * @param draft - The contact draft to inspect.
 * @returns True when nothing is entered on the active side.
 */
export function contactIsEmpty(draft: ContactDraft): boolean {
  return draft.mode === "email"
    ? draft.email.trim() === ""
    : draft.nationalNumber.replace(/\D/g, "") === "";
}

/**
 * Resolves the draft into the `{ email, phone }` pair the RPCs take.
 *
 * Email stays deliberately unvalidated beyond trimming — the server's
 * pattern is the real check, and a stricter client guess would reject
 * addresses the server accepts. The phone side IS validated, with the same
 * libphonenumber metadata the server normalizes with, so a number that
 * cannot exist in the selected country never leaves the form.
 *
 * @param draft - The contact draft to resolve.
 * @returns The RPC pair; `{email:"", phone:""}` for an empty draft; null
 *   when phone mode holds digits that are not a valid number there.
 */
export function contactPayload(
  draft: ContactDraft,
): { email: string; phone: string } | null {
  if (contactIsEmpty(draft)) return { email: "", phone: "" };
  if (draft.mode === "email") return { email: draft.email.trim(), phone: "" };
  if (!isValidPhone(draft.region, draft.nationalNumber)) return null;
  return { email: "", phone: composeE164(draft.region, draft.nationalNumber) };
}

/** The one sentence every form shows when contactPayload returns null. */
export const INVALID_PHONE_MESSAGE =
  "that isn't a valid phone number for the selected country";
