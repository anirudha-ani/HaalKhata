"use client";
/** Dialog for adding or editing one payment method: its name, currency, details, note and star. */

import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { Modal } from "@/components/ui/Modal/Modal";
import {
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_PAYMENT_METHOD_NOTE_LENGTH,
} from "@haalkhata/shared/text/limits";
import { CurrencyField } from "./components/CurrencyField/CurrencyField";
import { DetailsField } from "./components/DetailsField/DetailsField";
import { DETAIL_INPUT_CLASS } from "./components/DetailValueField/constants/detailInputs";
import { PreferredField } from "./components/PreferredField/PreferredField";
import { RemoveMethod } from "./components/RemoveMethod/RemoveMethod";
import { SaveBar } from "./components/SaveBar/SaveBar";
import { StartingPoints } from "./components/StartingPoints/StartingPoints";
import { PAYMENT_METHOD_FORM_ID } from "./constants/paymentMethodForm";
import { usePaymentMethodForm } from "./hooks/usePaymentMethodForm";

/**
 * Renders the add-and-edit form for a payment method, top to bottom in the
 * order it is filled in: where to start from (adding only), the name, the
 * currency, the details a payer needs, a note, and the star.
 *
 * A centred dialog on a desktop and a bottom sheet on a phone, both from
 * {@link Modal}. The Save button lives in the dialog's pinned footer,
 * because the bank starting point is taller than a phone screen.
 *
 * Failures stay inside the dialog: a field's problem under that field, a
 * refusal from the server above the button that caused it.
 *
 * @param props - Component props.
 * @returns The dialog.
 */
export function PaymentMethodModal({
  method,
  methods,
  defaultCurrency,
  onClose,
}: {
  /** The method being edited; omitted to add one. */
  method?: PaymentMethod;
  /** All of the owner's methods, to name the one a new star would displace. */
  methods: readonly PaymentMethod[];
  /** The owner's default currency, which a new method starts on. */
  defaultCurrency: string;
  /** Called when the dialog is dismissed, or the method is saved or removed. */
  onClose: () => void;
}) {
  const form = usePaymentMethodForm({ method, methods, defaultCurrency, onDone: onClose });
  const { draft, errors } = form;

  return (
    <Modal
      title={method ? "Edit payment method" : "Add payment method"}
      onClose={onClose}
      footer={
        <SaveBar
          formId={PAYMENT_METHOD_FORM_ID}
          label={method ? "Save changes" : "Add method"}
          pendingLabel="Saving…"
          pending={form.isSaving}
          disabled={form.isSaving || form.isRemoving}
          error={form.serverError}
        />
      }
    >
      <form
        id={PAYMENT_METHOD_FORM_ID}
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.save();
        }}
      >
        {method ? null : <StartingPoints selected={form.templateKey} onPick={form.pickTemplate} />}

        <label className="block text-sm font-medium">
          Name
          <input
            value={draft.name}
            onChange={(event) => form.setName(event.target.value)}
            maxLength={MAX_PAYMENT_METHOD_NAME_LENGTH}
            placeholder="What you call it: bKash, Chase checking…"
            autoComplete="off"
            className={`mt-1 ${DETAIL_INPUT_CLASS}`}
          />
          <span className="mt-1 block text-sm font-medium text-brand-600">{errors.name}</span>
        </label>

        <CurrencyField
          currency={draft.currency}
          anyCurrency={form.anyCurrency}
          error={errors.currency ?? ""}
          onCurrencyChange={form.setCurrency}
          onAnyCurrencyChange={form.setAnyCurrency}
        />

        <DetailsField
          details={draft.details}
          preset={draft.preset}
          kinds={form.kinds}
          errors={errors}
          canAdd={form.canAddDetail}
          canRemove={form.canRemoveDetail}
          onKindChange={form.setDetailKind}
          onChange={form.setDetail}
          onRemove={form.removeDetail}
          onAdd={form.addDetail}
        />

        <label className="block text-sm font-medium">
          Note to the payer <span className="font-normal text-ink-soft">(optional)</span>
          <input
            value={draft.note}
            onChange={(event) => form.setNote(event.target.value)}
            maxLength={MAX_PAYMENT_METHOD_NOTE_LENGTH}
            placeholder="Use Send Money, not Payment"
            autoComplete="off"
            className={`mt-1 ${DETAIL_INPUT_CLASS}`}
          />
          <span className="mt-1 block text-sm font-medium text-brand-600">{errors.note}</span>
        </label>

        <PreferredField
          preferred={draft.preferred}
          currencyName={form.currencyName}
          displacedName={form.displacedName}
          onChange={form.setPreferred}
        />

        {method ? (
          <RemoveMethod
            name={method.name}
            confirming={form.confirmingRemove}
            pending={form.isRemoving}
            onAsk={form.askRemove}
            onCancel={form.cancelRemove}
            onConfirm={form.removeMethod}
          />
        ) : null}
      </form>
    </Modal>
  );
}
