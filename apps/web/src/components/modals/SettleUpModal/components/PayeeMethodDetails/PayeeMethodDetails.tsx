"use client";
/** The details of the payment method a payer has selected: every identifier with Copy, a link where one exists, and the owner's note. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { detailLabel, detailValueText } from "@haalkhata/shared/payment/detailKinds";
import {
  detailCopyText,
  keyedDetails,
  methodCopyText,
  methodDisplayName,
} from "@haalkhata/shared/payment/formatMethod";
import { displayHandle, findPaymentMethod, paymentLink } from "@haalkhata/shared/payment/methods";
import { AppLink } from "./components/AppLink/AppLink";
import { ChangeNote } from "./components/ChangeNote/ChangeNote";
import { CopyAllButton } from "./components/CopyAllButton/CopyAllButton";
import { DetailLine } from "./components/DetailLine/DetailLine";
import { OwnerLinks } from "./components/OwnerLinks/OwnerLinks";

/**
 * Renders where to send the money for the method the payer selected: each
 * detail on its own line with a Copy button, a way to open the app or the
 * owner's link where there is one, the owner's note, and a word about how
 * recently the details came to be what they are.
 *
 * @param props - Component props.
 * @returns The details card.
 */
export function PayeeMethodDetails({
  method,
  firstName,
  amountCents,
  note,
}: {
  /** The method being paid into. */
  method: PaymentMethod;
  /** First name of the person being paid. */
  firstName: string;
  /** The amount being paid, for an app link that can carry it. */
  amountCents: number;
  /** The payment note, for an app link that can carry it. */
  note: string;
}) {
  const builtIn = findPaymentMethod(method.preset);
  // A built-in app's link is built from its one detail.
  const handle = method.details[0]?.value ?? "";

  return (
    <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
      <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
        {firstName}&apos;s {methodDisplayName(method)}
      </p>

      <ul className="space-y-2.5">
        {keyedDetails(method.details).map(({ key, detail }) => (
          <DetailLine
            key={key}
            label={detailLabel(detail)}
            value={
              // A username is shown the way the app's own profile prints it.
              builtIn && detail.kind === "username"
                ? displayHandle(method.preset, detail.value)
                : detailValueText(detail)
            }
            copyValue={detailCopyText(method, detail)}
          />
        ))}
      </ul>

      <OwnerLinks
        links={method.details
          .filter((detail) => detail.kind === "link")
          .map((detail) => detail.value)}
      />

      {builtIn ? (
        <AppLink builtIn={builtIn} link={paymentLink(method.preset, handle, amountCents, note)} />
      ) : null}

      {method.note ? (
        <p className="rounded-lg bg-card px-3 py-2 text-sm">
          <span className="block text-xs text-ink-soft">Note from {firstName}</span>
          <span className="break-words">{method.note}</span>
        </p>
      ) : null}

      {method.details.length > 1 ? <CopyAllButton text={methodCopyText(method)} /> : null}

      <ChangeNote
        createdAt={method.createdAt}
        updatedAt={method.updatedAt}
        firstName={firstName}
      />
    </div>
  );
}
