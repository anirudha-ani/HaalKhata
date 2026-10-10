"use client";
/** The "Get paid" card of the account page: the owner's payment methods, with add, edit, remove and star. */

import { Plus } from "lucide-react";
import { MAX_PAYMENT_METHODS_PER_USER } from "@haalkhata/shared/payment/payment.constants";
import { PaymentMethodModal } from "./components/PaymentMethodModal/PaymentMethodModal";
import { PaymentMethodRow } from "./components/PaymentMethodRow/PaymentMethodRow";
import { usePaymentMethods } from "./hooks/usePaymentMethods";

/**
 * Renders the owner's payment methods as a list they manage in place.
 *
 * A card of its own rather than fields inside the profile form: each method
 * saves when its dialog is saved, so nothing here waits for, or is lost by,
 * the profile's "Save changes" button.
 *
 * @param props - Component props.
 * @returns The card, and the add-and-edit dialog while it is open.
 */
export function PaymentMethodsCard({
  defaultCurrency,
}: {
  /** The owner's default currency, which a new method starts on. */
  defaultCurrency: string;
}) {
  const view = usePaymentMethods();

  return (
    <section
      aria-labelledby="payment-methods-heading"
      className="space-y-3 rounded-2xl border border-line bg-card p-5"
    >
      <div>
        <h2 id="payment-methods-heading" className="text-lg font-semibold">
          Get paid
        </h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Add how you want to be paid. Only people who owe you can see it, when they settle up.
        </p>
      </div>

      {view.isLoading ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
          Loading your payment methods…
        </p>
      ) : view.loadError ? (
        <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm">
          <p className="font-medium text-brand-700">
            Your payment methods could not be loaded: {view.loadError}
          </p>
          <button
            type="button"
            onClick={view.retryLoad}
            className="font-semibold text-brand-700 underline"
          >
            Try again
          </button>
        </div>
      ) : view.methods.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft">
          Nothing here yet. Add bKash, a bank account, Venmo, or whatever you use.
        </p>
      ) : (
        <ul className="space-y-2">
          {view.methods.map((method) => (
            <PaymentMethodRow
              key={method.id}
              method={method}
              error={view.starError.methodId === method.id ? view.starError.message : ""}
              onToggleStar={() => view.toggleStar(method)}
              onEdit={() => view.openEdit(method)}
            />
          ))}
        </ul>
      )}

      {/* Off while the list is unknown: adding against a list that failed to
          load could pass the cap check here and be refused by the server. */}
      <button
        type="button"
        onClick={view.openNew}
        disabled={!view.canAdd || view.isLoading || view.loadError !== ""}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink-soft hover:border-brand-600 hover:text-brand-600 disabled:opacity-50 disabled:hover:border-line disabled:hover:text-ink-soft"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Add payment method
      </button>
      {!view.canAdd ? (
        <p className="text-center text-xs text-ink-soft">
          You have {MAX_PAYMENT_METHODS_PER_USER} methods, the most allowed. Remove one to add
          another.
        </p>
      ) : null}

      {view.dialog.kind !== "closed" ? (
        <PaymentMethodModal
          // A different method is a different form: remounting resets every field.
          key={view.dialog.kind === "edit" ? view.dialog.method.id : "new"}
          method={view.dialog.kind === "edit" ? view.dialog.method : undefined}
          methods={view.methods}
          defaultCurrency={defaultCurrency}
          onClose={view.closeDialog}
        />
      ) : null}
    </section>
  );
}
