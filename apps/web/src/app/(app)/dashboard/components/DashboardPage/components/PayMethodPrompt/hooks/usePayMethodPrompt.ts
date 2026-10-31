"use client";
/** State of the Home prompt to add a payment method: whether there is something to prompt about, its dismissal, and the add dialog. */

import { useState, useSyncExternalStore } from "react";
import type { CounterpartyBalance } from "@haalkhata/shared/api/plainMessages";
import { usePaymentMethodsAPI } from "@/lib/hooks/usePaymentMethodsAPI";
import { MAX_PAYMENT_METHODS_PER_USER } from "@haalkhata/shared/payment/payment.constants";
import { findPayPrompt } from "@haalkhata/shared/payment/payPrompt";
import { PAY_PROMPT_DISMISS_KEY } from "../constants/payMethodPrompt";

/**
 * Works out whether to tell the person that people owe them and have
 * nowhere to send it.
 *
 * The person's payment methods are fetched only when somebody owes them,
 * and the prompt waits for that list: an unknown list is not an empty one,
 * and telling someone with three methods that they have none would be worse
 * than staying quiet for a moment.
 *
 * @param options - Everyone the person has a balance with, the order the
 *   page lists currencies in, and the person's default currency.
 * @returns The prompt (or undefined), the methods the add dialog needs, and
 *   the dismiss and add actions.
 */
export function usePayMethodPrompt({
  counterparties,
  currencyOrder,
  defaultCurrency,
}: {
  /** Everyone the person has a balance with. */
  counterparties: readonly CounterpartyBalance[];
  /** Currencies in the order the page lists them, the person's default first. */
  currencyOrder: readonly string[];
  /** The person's default currency. */
  defaultCurrency: string;
}) {
  const people = counterparties.flatMap((counterparty) =>
    counterparty.user
      ? [
          {
            name: counterparty.user.name,
            // A server predating `balances` sends only the default-currency
            // scalar, which reads the same way as one bucket.
            balances:
              counterparty.balances.length > 0
                ? counterparty.balances
                : [{ currency: defaultCurrency, cents: counterparty.netCents }],
          },
        ]
      : [],
  );
  const someoneOwes = people.some((person) =>
    person.balances.some((balance) => balance.cents > 0),
  );
  const { methodsQuery } = usePaymentMethodsAPI({ enabled: someoneOwes });
  const methods = methodsQuery.data?.methods;

  // useSyncExternalStore rather than an effect, as the phone prompt does: the
  // server snapshot says "dismissed", so the server render and hydration
  // agree on nothing, and the real answer arrives right after.
  const storedDismissed = useSyncExternalStore(
    () => () => {
      // The store never changes underneath us; dismissal is local state below.
    },
    () => {
      try {
        return sessionStorage.getItem(PAY_PROMPT_DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [dismissedNow, setDismissedNow] = useState(false);
  // The currency the add dialog was opened for. Held apart from the prompt:
  // saving the method makes the prompt move on to the next currency, and the
  // dialog must not follow it mid-save.
  const [addingFor, setAddingFor] = useState("");

  const dismissed = storedDismissed || dismissedNow;
  const prompt =
    dismissed || !methods ? undefined : findPayPrompt(people, methods, currencyOrder);

  return {
    prompt,
    methods: methods ?? [],
    /**
     * True when the list is full. The prompt then says so, with the number,
     * where it would have offered a form the server is certain to refuse.
     */
    atCap: (methods?.length ?? 0) >= MAX_PAYMENT_METHODS_PER_USER,
    addingFor,
    openAdd: () => setAddingFor(prompt?.currency ?? ""),
    closeAdd: () => setAddingFor(""),
    dismiss: () => {
      setDismissedNow(true);
      try {
        sessionStorage.setItem(PAY_PROMPT_DISMISS_KEY, "1");
      } catch {
        // A blocked store only means the prompt returns on the next page load.
      }
    },
  };
}
