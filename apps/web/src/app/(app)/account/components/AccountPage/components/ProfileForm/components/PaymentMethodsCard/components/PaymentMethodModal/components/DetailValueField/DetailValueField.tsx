"use client";
/** The value control of one payment detail: a phone field, a choice, or a text input with the right keyboard. */

import { PhoneField } from "@/components/ui/PhoneField/PhoneField";
import {
  ACCOUNT_TYPES,
  CUSTOM_DETAIL_KIND,
  detailKindName,
  findDetailKind,
} from "@haalkhata/shared/payment/detailKinds";
import { findPaymentMethod } from "@haalkhata/shared/payment/methods";
import type { DetailDraft } from "@haalkhata/shared/payment/methodDraft";
import { MAX_PAYMENT_DETAIL_LABEL_LENGTH } from "@haalkhata/shared/text/limits";
import { DETAIL_INPUT_CLASS, INPUT_MODES } from "./constants/detailInputs";

/**
 * Renders the control a detail's value is typed into.
 *
 * Identifiers are typed exactly: no auto-capitalisation, no autocorrect, no
 * spell check. A phone that "fixes" an IBAN or a username produces a wrong
 * one, and nothing on screen would say so.
 *
 * @param props - Component props.
 * @returns The value control for the row's kind.
 */
export function DetailValueField({
  detail,
  preset,
  onChange,
}: {
  /** The row being edited. */
  detail: DetailDraft;
  /** The method's preset key, whose fixed prefix is drawn in front of a username. */
  preset: string;
  /** Called with the typed fields that changed. */
  onChange: (patch: Partial<DetailDraft>) => void;
}) {
  const kind = findDetailKind(detail.kind);
  // A custom detail is named by its own label once it has one.
  const label =
    (detail.kind === CUSTOM_DETAIL_KIND && detail.label.trim()) || detailKindName(detail.kind);

  if (kind?.input === "phone") {
    return (
      <PhoneField
        region={detail.region}
        nationalNumber={detail.nationalNumber}
        onRegionChange={(region) => onChange({ region })}
        onNationalNumberChange={(nationalNumber) => onChange({ nationalNumber })}
        label={label}
      />
    );
  }

  if (kind?.input === "choice") {
    return (
      <select
        value={detail.value}
        onChange={(event) => onChange({ value: event.target.value })}
        aria-label={label}
        className={DETAIL_INPUT_CLASS}
      >
        <option value="">Choose…</option>
        {ACCOUNT_TYPES.map((accountType) => (
          <option key={accountType.key} value={accountType.key}>
            {accountType.label}
          </option>
        ))}
      </select>
    );
  }

  const mode = INPUT_MODES[kind?.input ?? "text"];
  // A built-in app's sigil is furniture, not something to type: drawn inside
  // the border so the group still reads as one field.
  const prefix = detail.kind === "username" ? (findPaymentMethod(preset)?.handlePrefix ?? "") : "";
  const valueInput = (
    <span className="flex min-w-0 items-center rounded-xl border border-line bg-card focus-within:border-brand-500">
      {prefix ? <span className="pl-3 text-ink-soft select-none">{prefix}</span> : null}
      <input
        type={mode.type}
        inputMode={mode.inputMode}
        value={detail.value}
        onChange={(event) => onChange({ value: event.target.value })}
        maxLength={kind?.maxLength}
        placeholder={prefix ? (findPaymentMethod(preset)?.handleExample ?? "") : kind?.example}
        aria-label={label}
        autoCapitalize={kind?.capitals ?? "none"}
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        className={`min-w-0 flex-1 bg-transparent py-2 pr-3 text-base focus:outline-none ${
          prefix ? "pl-0.5" : "pl-3"
        }`}
      />
    </span>
  );

  if (detail.kind !== CUSTOM_DETAIL_KIND) return valueInput;
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={detail.label}
        onChange={(event) => onChange({ label: event.target.value })}
        maxLength={MAX_PAYMENT_DETAIL_LABEL_LENGTH}
        placeholder="What is it called? IFSC, Sort code…"
        aria-label="Label for this detail"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        className={DETAIL_INPUT_CLASS}
      />
      {valueInput}
    </div>
  );
}
