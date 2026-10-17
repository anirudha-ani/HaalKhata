"use client";
/** The "let people find me from their contacts" switch, with what it means beside it. */

import { CONTACT_DISCOVERY_SETTING } from "@haalkhata/shared/contacts/contactsCopy";

/**
 * Renders the discoverability switch. It only reports changes; saving is the
 * caller's (immediately under Account, on Continue during onboarding).
 *
 * @param props - Component props.
 * @returns The labelled switch and its explanation.
 */
export function ContactDiscoveryToggle({
  checked,
  disabled = false,
  onChange,
}: {
  /** Whether the switch is on. */
  checked: boolean;
  /** Whether a save is in flight. */
  disabled?: boolean;
  /** Called with the new position when the person flips it. */
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{CONTACT_DISCOVERY_SETTING.label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
          {CONTACT_DISCOVERY_SETTING.detail}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-brand-600 checked:before:translate-x-5 disabled:cursor-wait disabled:opacity-60"
      />
    </label>
  );
}
