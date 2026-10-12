"use client";
/** Last step of the first-run flow: an optional chance to say how you want to be paid. */

import { PaymentMethodsCard } from "@/components/payment/PaymentMethodsCard/PaymentMethodsCard";
import { usePaymentMethodsAPI } from "@/lib/hooks/usePaymentMethodsAPI";
import { finishOnboardingLabel } from "@haalkhata/shared/payment/copy";

/**
 * Renders the payment step of onboarding: the same "Get paid" list the
 * account page has, and one button that leaves onboarding.
 *
 * One button, whose label follows the state of the list. With nothing added
 * it reads "Skip and open your HaalKhata", because leaving then is skipping
 * and the button should say so. Once a method exists it reads "Open your
 * HaalKhata". It is still a single button, so nobody has to work out which
 * of two loses what they just typed.
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
  // The same cached list the card above renders, so the label changes in
  // the same moment a method appears in it.
  const { methodsQuery } = usePaymentMethodsAPI();
  const hasMethods = (methodsQuery.data?.methods.length ?? 0) > 0;

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
        {pending ? "One moment…" : finishOnboardingLabel(hasMethods)}
      </button>
      <p className="text-center text-xs text-ink-soft">
        You can add or change these any time in Account.
      </p>
    </div>
  );
}
