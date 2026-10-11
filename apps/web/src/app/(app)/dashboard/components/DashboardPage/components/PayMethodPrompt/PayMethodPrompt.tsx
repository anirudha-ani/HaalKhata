"use client";
/** Home prompt shown when people owe you in a currency you have no payment method for. */

import Link from "next/link";
import type { CounterpartyBalance } from "@haalkhata/protogen/common/v1/common_pb";
import { PaymentMethodModal } from "@/components/payment/PaymentMethodModal/PaymentMethodModal";
import { formatMoney } from "@haalkhata/shared/money/money";
import { methodCapLine } from "@haalkhata/shared/payment/copy";
import { MAX_PAYMENT_METHODS_PER_USER } from "@haalkhata/shared/payment/payment.constants";
import { owedLine } from "@haalkhata/shared/payment/payPrompt";
import { usePayMethodPrompt } from "./hooks/usePayMethodPrompt";

/**
 * Renders a prompt to add a payment method at the moment one is missed:
 * somebody owes the person, and nothing the person has set up works in that
 * currency, so the settle dialog would show the payer nowhere to send it.
 *
 * It says who owes and how much, names one currency, and opens the add
 * dialog already in that currency. Adding the method makes it go away, or
 * move on to the next currency with the same gap. "Not now" hides it for
 * the session.
 *
 * Someone whose list is already full is told so, with a way to Account,
 * where one can be removed: the form would only be refused. And a dialog
 * opened from here outlives the prompt being hidden, so a failed refresh of
 * the balances behind it does not take what was typed with it.
 *
 * @param props - Component props.
 * @returns The prompt, the add dialog while it is open, or nothing.
 */
export function PayMethodPrompt({
  counterparties,
  currencyOrder,
  defaultCurrency,
  hidden,
}: {
  /** Everyone the person has a balance with. */
  counterparties: readonly CounterpartyBalance[];
  /** Currencies in the order the page lists them, the person's default first. */
  currencyOrder: readonly string[];
  /** The person's default currency. */
  defaultCurrency: string;
  /** True while the balances behind the prompt could not be refreshed; the prompt waits, an open dialog stays. */
  hidden: boolean;
}) {
  const view = usePayMethodPrompt({ counterparties, currencyOrder, defaultCurrency });
  const { prompt } = view;

  return (
    <>
      {prompt && !hidden ? (
        // Stacked on a phone, one row from `sm` up. Letting the sentence and
        // the buttons share a wrapping row squeezed the sentence into a
        // one-word column at 360px.
        <div className="flex flex-col gap-3 rounded-2xl border border-pos-600/30 bg-pos-50 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Tell people how to pay you.</span>{" "}
            {owedLine(prompt.names, formatMoney(prompt.cents, prompt.currency))}, and you have not
            added a way to be paid in {prompt.currency}.
            {view.atCap ? (
              <span className="mt-1 block text-ink-soft">
                {methodCapLine(MAX_PAYMENT_METHODS_PER_USER, prompt.currency)}
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {view.atCap ? (
              <Link
                href="/account"
                className="flex min-h-11 items-center rounded-lg bg-pos-600 px-3 font-semibold text-white hover:bg-pos-700"
              >
                Open Account
              </Link>
            ) : (
              <button
                type="button"
                onClick={view.openAdd}
                className="min-h-11 rounded-lg bg-pos-600 px-3 font-semibold text-white hover:bg-pos-700"
              >
                Add a payment method
              </button>
            )}
            <button
              type="button"
              onClick={view.dismiss}
              className="min-h-11 rounded-lg px-2 font-medium text-ink-soft hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {view.addingFor ? (
        <PaymentMethodModal
          methods={view.methods}
          defaultCurrency={defaultCurrency}
          forCurrency={view.addingFor}
          onClose={view.closeAdd}
        />
      ) : null}
    </>
  );
}
