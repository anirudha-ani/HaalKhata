/** The facts about an unclaimed account a phone number would absorb. */

import type { MergePreview as MergePreviewMessage } from "@haalkhata/protogen/auth/v1/auth_pb";
import { outstandingBuckets } from "@haalkhata/shared/money/balances";
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
  /** The caller's default currency: listed first, and the fallback label for older servers. */
  currency: string;
}) {
  // One position per currency, never a sum: a server predating `nets` sends
  // only the default-currency bucket, which reads the same way.
  const nets = outstandingBuckets(
    preview.nets?.length ? preview.nets : [{ currency, cents: preview.netCents }],
    currency,
  );
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <p className="font-display text-lg text-ink">{preview.name}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {preview.expenseCount} {preview.expenseCount === 1 ? "expense" : "expenses"}
        {nets.map((bucket) => (
          <span key={bucket.currency}>
            {" · "}
            <span className={bucket.cents > 0 ? "text-pos-600" : "text-neg-600"}>
              {bucket.cents > 0 ? "owed " : "owes "}
              {formatMoney(Math.abs(bucket.cents), bucket.currency)}
            </span>
          </span>
        ))}
      </p>
      {preview.counterpartyNames.length > 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          Shared with {preview.counterpartyNames.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
