"use client";
/** Last step of the first-run flow: an optional chance to say how you want to be paid. */

import { PaymentMethodsCard } from "@/components/payment/PaymentMethodsCard/PaymentMethodsCard";

/**
 * Renders the payment step of onboarding: the same "Get paid" list the
 * account page has, and one button that opens the ledger.
 *
 * There is no separate "skip". Adding a method is optional and the heading
 * says so, so the one button means the same thing with or without one, and
 * nobody has to work out which of two buttons loses what they just typed.
 *
 * @param props - Component props.
 * @returns The step.
 */
export function PaymentStep({
  defaultCurrency,
  error,
  pending,
  onFinish,
}: {
  /** The currency picked on the previous step, which a new method starts on. */
  defaultCurrency: string;
  /** Why leaving onboarding failed; empty when it has not. */
  error: string;
  /** Whether leaving onboarding is in flight. */
  pending: boolean;
  /** Called to mark onboarding done and open the ledger. */
  onFinish: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PaymentMethodsCard defaultCurrency={defaultCurrency} />
      {error ? <p className="text-sm text-brand-600">{error}</p> : null}
      <button
        type="button"
        onClick={onFinish}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "One moment…" : "Open your ledger"}
      </button>
      <p className="text-center text-xs text-ink-soft">
        You can add or change these any time in Account.
      </p>
    </div>
  );
}
