"use client";
/** The details of a payment method: the rows a payer will read, and a way to add another. */

import { Plus } from "lucide-react";
import type { DetailDraft } from "@haalkhata/shared/payment/methodDraft";
import type { PaymentMethodErrors } from "@haalkhata/shared/payment/validateMethod";
import { DetailRow } from "../DetailRow/DetailRow";

/**
 * Renders the method's detail rows under a line that says what belongs in
 * them, and what never does.
 *
 * @param props - Component props.
 * @returns The rows, the list's own error, and the add button while another row is allowed.
 */
export function DetailsField({
  details,
  preset,
  kinds,
  errors,
  canAdd,
  onKindChange,
  onChange,
  onRemove,
  onAdd,
}: {
  /** The rows being edited, in order. */
  details: readonly DetailDraft[];
  /** The method's preset key, or "". */
  preset: string;
  /** Kinds a row may be switched between. */
  kinds: readonly string[];
  /** The form's errors; rows are looked up by their index. */
  errors: PaymentMethodErrors;
  /** Whether another row may be added. */
  canAdd: boolean;
  /** Called with a row's id and the kind picked for it. */
  onKindChange: (rowId: string, kindKey: string) => void;
  /** Called with a row's id and the typed fields that changed. */
  onChange: (rowId: string, patch: Partial<DetailDraft>) => void;
  /** Called with the id of the row dropped. */
  onRemove: (rowId: string) => void;
  /** Called when another row is asked for. */
  onAdd: () => void;
}) {
  // A built-in app's link is built from its one detail, so that row stays.
  const canRemove = preset === "" && details.length > 1;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Details</p>
        <p className="text-xs text-ink-soft">
          Only what someone needs to send you money. Never a card number, PIN or password. Leave a
          row blank to skip it.
        </p>
      </div>
      <ul className="space-y-3">
        {details.map((detail, index) => (
          <DetailRow
            key={detail.rowId}
            detail={detail}
            preset={preset}
            kinds={kinds}
            error={errors.detailRows[index] ?? ""}
            canRemove={canRemove}
            onKindChange={(kindKey) => onKindChange(detail.rowId, kindKey)}
            onChange={(patch) => onChange(detail.rowId, patch)}
            onRemove={() => onRemove(detail.rowId)}
          />
        ))}
      </ul>
      {errors.details ? (
        <p className="text-sm font-medium text-brand-600">{errors.details}</p>
      ) : null}
      {canAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-brand-600"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add another detail
        </button>
      ) : null}
    </div>
  );
}
