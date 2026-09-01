"use client";
/** Contact input: an Email | Phone toggle whose phone side is the country-aware PhoneField. */

import type { ContactDraft, ContactMode } from "@haalkhata/shared/phone/contact";
import { PhoneField } from "./PhoneField";

/** The two halves of the toggle, in the order they render. */
const CONTACT_MODES: { key: ContactMode; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

/**
 * Renders an email-or-phone contact field as an explicit choice instead of
 * one guessing box. The old single input routed by "contains an @", which
 * left phone numbers with no country picker and no validation; here the
 * phone side is the same searchable-country {@link PhoneField} the account
 * page uses, so a number always arrives with its country and is checked
 * against that country's numbering plan before it can be submitted.
 *
 * @param props - Component props.
 * @returns The toggled contact field.
 */
export function EmailOrPhoneField({
  contact,
  onContactChange,
  emailPlaceholder = "you@example.com",
  emailLabel = "Email address",
  phoneLabel = "Phone number",
  autoFocus = false,
}: {
  /** Current draft: mode plus both sides' values. */
  contact: ContactDraft;
  /** Called with the whole updated draft on every change. */
  onContactChange: (contact: ContactDraft) => void;
  /** Placeholder for the email box. */
  emailPlaceholder?: string;
  /** Accessible label for the email box. */
  emailLabel?: string;
  /** Accessible label for the phone box. */
  phoneLabel?: string;
  /** Whether the email box takes focus on mount. */
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg bg-paper p-0.5 text-xs font-semibold">
        {CONTACT_MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            aria-pressed={contact.mode === mode.key}
            onClick={() => onContactChange({ ...contact, mode: mode.key })}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              contact.mode === mode.key
                ? "bg-card text-brand-700 shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {contact.mode === "email" ? (
        <input
          type="text"
          inputMode="email"
          autoFocus={autoFocus}
          placeholder={emailPlaceholder}
          aria-label={emailLabel}
          value={contact.email}
          onChange={(event) => onContactChange({ ...contact, email: event.target.value })}
          className="w-full rounded-xl border border-line bg-card px-3.5 py-3 focus:border-brand-500 focus:outline-none"
        />
      ) : (
        <PhoneField
          region={contact.region}
          nationalNumber={contact.nationalNumber}
          onRegionChange={(region) => onContactChange({ ...contact, region })}
          onNationalNumberChange={(nationalNumber) =>
            onContactChange({ ...contact, nationalNumber })
          }
          label={phoneLabel}
        />
      )}
    </div>
  );
}
