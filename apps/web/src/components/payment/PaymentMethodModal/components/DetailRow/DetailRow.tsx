"use client";
/** One detail row of the payment method form: what kind of detail it is, its value, and a way to drop it. */

import { X } from "lucide-react";
import { detailKindName } from "@haalkhata/shared/payment/detailKinds";
import type { DetailDraft } from "@haalkhata/shared/payment/methodDraft";
import { DetailValueField } from "../DetailValueField/DetailValueField";

/**
 * Renders one detail of the method being edited.
 *
 * Stacked at every width: the kind and the remove button share the first
 * line, the value takes the whole second. Side by side was tried for wide
 * screens and dropped, because the dialog is 28rem wide wherever it opens
 * and a phone number next to a kind picker lost its last digits.
 *
 * @param props - Component props.
 * @returns The row, with its error underneath when it has one.
 */
export function DetailRow({
  detail,
  preset,
  kinds,
  error,
  canRemove,
  onKindChange,
  onChange,
  onRemove,
}: {
  /** The row being edited. */
  detail: DetailDraft;
  /** The method's preset key, or "". */
  preset: string;
  /** Kinds this row may be switched between. */
  kinds: readonly string[];
  /** What is wrong with this row; empty when nothing is. */
  error: string;
  /** Whether the row can be dropped; false for a built-in app's one detail. */
  canRemove: boolean;
  /** Called with the kind picked. */
  onKindChange: (kindKey: string) => void;
  /** Called with the typed fields that changed. */
  onChange: (patch: Partial<DetailDraft>) => void;
  /** Called when the row is dropped. */
  onRemove: () => void;
}) {
  return (
    <li className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        {kinds.length > 1 ? (
          <select
            value={detail.kind}
            onChange={(event) => onKindChange(event.target.value)}
            aria-label="Kind of detail"
            className="h-[42px] w-full min-w-0 rounded-xl border border-line bg-paper px-2.5 text-base text-ink-soft focus:border-brand-500 focus:outline-none"
          >
            {kinds.map((kindKey) => (
              <option key={kindKey} value={kindKey}>
                {detailKindName(kindKey)}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex h-[42px] items-center text-sm text-ink-soft">
            {detailKindName(detail.kind)}
          </span>
        )}
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${detailKindName(detail.kind)}`}
            className="flex h-[42px] w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-paper hover:text-brand-600"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span />
        )}
        <div className="col-span-2 min-w-0">
          <DetailValueField detail={detail} preset={preset} onChange={onChange} />
        </div>
      </div>
      {error ? <p className="text-sm font-medium text-brand-600">{error}</p> : null}
    </li>
  );
}
