"use client";
/** State of the add-and-edit payment method dialog: the shared form, plus this app's save and remove actions. */

import { useReducer, useState } from "react";
import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { errorMessage } from "@/lib/api/connect";
import type { DetailDraft } from "@haalkhata/shared/payment/methodDraft";
import {
  initialMethodForm,
  methodFormReducer,
  readMethodForm,
} from "@haalkhata/shared/payment/methodForm";
import { usePaymentMethodsAPI } from "../../../hooks/usePaymentMethodsAPI";

/**
 * Holds one payment method while it is being added or edited.
 *
 * The form itself (what is typed, how a row changes kind, when errors show,
 * whose star would be displaced) is the shared reducer the mobile app runs
 * too. This hook adds what belongs to an app: the mutations, and where a
 * refusal from the server is put.
 *
 * @param options - The method being edited (absent when adding), the
 *   owner's other methods, their default currency, and what to do when done.
 * @returns The draft with its setters, the errors to show, and the actions.
 */
export function usePaymentMethodForm({
  method,
  methods,
  defaultCurrency,
  onDone,
}: {
  /** The method being edited; undefined when adding one. */
  method?: PaymentMethod;
  /** All of the owner's methods, to say which one a new star would displace. */
  methods: readonly PaymentMethod[];
  /** The owner's default currency, which a new method starts on. */
  defaultCurrency: string;
  /** Called once the method is saved or removed. */
  onDone: () => void;
}) {
  const { create, update, remove } = usePaymentMethodsAPI();
  const [state, dispatch] = useReducer(methodFormReducer, undefined, () =>
    initialMethodForm(method, defaultCurrency),
  );
  const [serverError, setServerError] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const view = readMethodForm(state, methods, method?.id ?? "");

  /** Validates the draft and, when it passes, creates or updates the method. */
  const save = async () => {
    dispatch({ type: "attemptSave" });
    setServerError("");
    if (!view.check.valid) return;
    const fields = { ...view.check.method, preferred: state.draft.preferred };
    try {
      if (method) await update.mutateAsync({ ...fields, id: method.id });
      else await create.mutateAsync(fields);
      onDone();
    } catch (saveError) {
      // Stays in the dialog, above the button that caused it, with
      // everything typed still in place.
      setServerError(errorMessage(saveError));
    }
  };

  /** Removes the method being edited, after the in-place confirmation. */
  const removeMethod = async () => {
    if (!method) return;
    setServerError("");
    try {
      await remove.mutateAsync(method.id);
      onDone();
    } catch (removeError) {
      setServerError(errorMessage(removeError));
    }
  };

  return {
    ...view,
    templateKey: state.templateKey,
    draft: state.draft,
    serverError,
    /**
     * Starts the form over from another starting point. Only offered while
     * adding, where the form has nothing saved to lose.
     *
     * @param templateKey - The starting point picked.
     */
    pickTemplate: (templateKey: string) => {
      setServerError("");
      dispatch({ type: "pickTemplate", templateKey });
    },
    setName: (name: string) => dispatch({ type: "setName", name }),
    setNote: (note: string) => dispatch({ type: "setNote", note }),
    setPreferred: (preferred: boolean) => dispatch({ type: "setPreferred", preferred }),
    setCurrency: (currency: string) => dispatch({ type: "setCurrency", currency }),
    setAnyCurrency: (anyCurrency: boolean) => dispatch({ type: "setAnyCurrency", anyCurrency }),
    setDetailKind: (rowId: string, kindKey: string) =>
      dispatch({ type: "setDetailKind", rowId, kindKey }),
    setDetail: (rowId: string, patch: Partial<DetailDraft>) =>
      dispatch({ type: "setDetail", rowId, patch }),
    addDetail: () => dispatch({ type: "addDetail" }),
    removeDetail: (rowId: string) => dispatch({ type: "removeDetail", rowId }),
    save: () => void save(),
    isSaving: create.isPending || update.isPending,
    confirmingRemove,
    askRemove: () => setConfirmingRemove(true),
    cancelRemove: () => setConfirmingRemove(false),
    removeMethod: () => void removeMethod(),
    isRemoving: remove.isPending,
  };
}
