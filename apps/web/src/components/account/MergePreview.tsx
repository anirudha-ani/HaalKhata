/** The facts about an unclaimed account a phone number would absorb. */

import type { MergePreview as MergePreviewMessage } from "@haalkhata/protogen/auth/v1/auth_pb";
import { formatMoney } from "@haalkhata/shared/money/money";

/**
 * Renders what claiming a phone number would pull onto the account: the name
 * the invitation carries, how much history sits behind it, and — the part that
 * actually settles the question — who those expenses are with.
 *
 * Facts only. Each caller writes its own explanation and buttons around this,
 * because backing out reads differently during first-run than it does from a
 * settings page.
 *
 * @param props - Component props.
 * @returns The preview card.
 */
export function MergePreview({
  preview,
  currency,
}: {
  /** The server's preview of the row that would be absorbed. */
  preview: MergePreviewMessage;
  /** ISO 4217 code to render the net position in. */
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="font-display text-lg text-ink">{preview.name}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {preview.expenseCount} {preview.expenseCount === 1 ? "expense" : "expenses"}
        {preview.netCents !== 0 ? (
          <>
            {" · "}
            <span className={preview.netCents > 0 ? "text-pos-600" : "text-neg-600"}>
              {preview.netCents > 0 ? "owed " : "owes "}
              {formatMoney(Math.abs(preview.netCents), currency)}
            </span>
          </>
        ) : null}
      </p>
      {preview.counterpartyNames.length > 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          Shared with {preview.counterpartyNames.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
