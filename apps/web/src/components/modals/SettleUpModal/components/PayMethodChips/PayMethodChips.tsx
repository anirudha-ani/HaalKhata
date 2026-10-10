"use client";
/** The "How" chips of the settle dialog: the person's payment methods for this currency, then Cash and Other. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { PLAIN_PAY_CHOICES } from "@haalkhata/shared/payment/payeeMethods";
import { CHIP_CLASS } from "./constants/chips";

/**
 * Renders the ways this payment can be made.
 *
 * First the methods that work in the payment's currency, the starred one
 * leading and tagged, so the right choice is obvious before anything is
 * tapped. Then Cash and Other, which need nobody's details. Methods tied to
 * another currency come last under their own line: they are real ways to
 * reach the person, but using one means converting the amount, and the
 * dialog does not pretend otherwise by mixing them in.
 *
 * @param props - Component props.
 * @returns The chip groups; each wraps onto more lines on a narrow screen.
 */
export function PayMethodChips({
  usable,
  others,
  choice,
  onPick,
}: {
  /** Methods that work in the payment's currency, best first. */
  usable: readonly PaymentMethod[];
  /** Methods tied to another currency. */
  others: readonly PaymentMethod[];
  /** The selection: a method's id or a plain choice's key. */
  choice: string;
  /** Called with the id or key picked. */
  onPick: (choice: string) => void;
}) {
  const chipClass = (chipKey: string) =>
    `rounded-full border px-3 py-1.5 text-sm ${
      choice === chipKey ? CHIP_CLASS.selected : CHIP_CLASS.resting
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {usable.map((method) => (
          <button
            key={method.id}
            type="button"
            aria-pressed={choice === method.id}
            onClick={() => onPick(method.id)}
            className={chipClass(method.id)}
          >
            {method.name}
            {method.preferred ? (
              <span className="ml-1.5 rounded-full bg-pos-50 px-1.5 py-0.5 text-[11px] font-semibold text-pos-700">
                Preferred
              </span>
            ) : null}
          </button>
        ))}
        {PLAIN_PAY_CHOICES.map((plain) => (
          <button
            key={plain.key}
            type="button"
            aria-pressed={choice === plain.key}
            onClick={() => onPick(plain.key)}
            className={chipClass(plain.key)}
          >
            {plain.label}
          </button>
        ))}
      </div>
      {others.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-soft">Works in other currencies</p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((method) => (
              <button
                key={method.id}
                type="button"
                aria-pressed={choice === method.id}
                onClick={() => onPick(method.id)}
                className={chipClass(method.id)}
              >
                {method.name}
                <span className="ml-1.5 text-xs text-ink-soft">{method.currency}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
