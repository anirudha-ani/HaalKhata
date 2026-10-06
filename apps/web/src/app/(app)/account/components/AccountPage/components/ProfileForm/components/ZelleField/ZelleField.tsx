"use client";
/** Zelle handle field: a phone-or-email choice, because Zelle matches the exact string a bank registered. */

import { PhoneField } from "@/components/ui/PhoneField/PhoneField";
import { useProfileForm } from "../../hooks/useProfileForm";
import { ZELLE_MODES } from "./constants/zelleModes";

/**
 * Renders the Zelle handle field as a choice between a phone and an email,
 * because a bank registers one or the other and Zelle matches the exact
 * string. A single free-text box left people typing a bare "4015550147",
 * which is ambiguous the moment anyone is outside the US; the phone side
 * reuses {@link PhoneField} so a country code comes along by construction.
 *
 * @param props - Component props.
 * @param props.form - The profile form state from {@link useProfileForm}.
 * @returns The Zelle row of the payment handles fieldset.
 */
export function ZelleField({ form }: { form: ReturnType<typeof useProfileForm> }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-ink-soft">Zelle</span>
        <div className="inline-flex rounded-lg bg-paper p-0.5 text-xs font-semibold">
          {ZELLE_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              aria-pressed={form.zelleMode === mode.key}
              onClick={() => form.setZelleMode(mode.key)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                form.zelleMode === mode.key
                  ? "bg-card text-brand-700 shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
      {form.zelleMode === "phone" ? (
        <PhoneField
          region={form.zelleRegion}
          nationalNumber={form.zelleNationalNumber}
          onRegionChange={form.setZelleRegion}
          onNationalNumberChange={form.setZelleNationalNumber}
          label="Zelle phone number"
        />
      ) : (
        <input
          type="email"
          inputMode="email"
          value={form.handles.zelle ?? ""}
          onChange={(event) => form.setHandle("zelle", event.target.value)}
          placeholder="jordan@example.com"
          aria-label="Zelle email address"
          className="w-full rounded-xl border border-line bg-card px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
      )}
    </div>
  );
}
