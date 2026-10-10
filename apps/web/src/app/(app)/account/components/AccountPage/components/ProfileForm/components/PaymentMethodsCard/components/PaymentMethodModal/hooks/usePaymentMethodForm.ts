"use client";
/** State of the add-and-edit payment method dialog: the draft, its validation, and the save and remove actions. */

import { useState } from "react";
import type { PaymentMethod } from "@haalkhata/protogen/payment/v1/payment_pb";
import { errorMessage } from "@/lib/api/connect";
import { ANY_CURRENCY_LABEL } from "@haalkhata/shared/payment/formatMethod";
import {
  canAddDetail,
  detailDraft,
  draftFields,
  methodDraft,
  nextDetailKind,
  selectableDetailKinds,
  templateDraft,
  withDetailKind,
  type DetailDraft,
  type MethodDraft,
} from "@haalkhata/shared/payment/methodDraft";
import { checkPaymentMethod } from "@haalkhata/shared/payment/validateMethod";
import { usePaymentMethodsAPI } from "../../../hooks/usePaymentMethodsAPI";
import { DEFAULT_TEMPLATE_KEY, NO_ERRORS } from "../constants/paymentMethodForm";

/**
 * Holds one payment method while it is being added or edited.
 *
 * Validation runs on every render with the validator the server uses, but
 * its messages are shown only after the first save attempt: a form that
 * opens covered in "give this method a name" is scolding someone who has not
 * typed yet. After that attempt the messages follow the typing, so each one
 * disappears as its field is fixed.
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
  const [templateKey, setTemplateKey] = useState(DEFAULT_TEMPLATE_KEY);
  const [draft, setDraft] = useState<MethodDraft>(() =>
    method
      ? methodDraft(method, method.preferred)
      : templateDraft(DEFAULT_TEMPLATE_KEY, defaultCurrency),
  );
  // What "one currency" goes back to after "any currency" was ticked and unticked.
  const [lastCurrency, setLastCurrency] = useState(
    () => method?.currency || defaultCurrency,
  );
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const check = checkPaymentMethod(draftFields(draft));
  const errors = attempted ? check.errors : NO_ERRORS;

  // Starring this method takes the star from whichever method holds it for
  // the same currency. Said before saving, not discovered in the list after.
  const displaced = draft.preferred
    ? methods.find(
        (other) =>
          other.preferred && other.id !== method?.id && other.currency === check.method.currency,
      )
    : undefined;

  /**
   * Replaces part of the draft.
   *
   * @param patch - The fields to change.
   */
  const patchDraft = (patch: Partial<MethodDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  /**
   * Replaces one detail row.
   *
   * @param rowId - The row to change.
   * @param change - Builds the new row from the current one.
   */
  const changeDetail = (rowId: string, change: (detail: DetailDraft) => DetailDraft) =>
    setDraft((current) => ({
      ...current,
      details: current.details.map((detail) => (detail.rowId === rowId ? change(detail) : detail)),
    }));

  /** Validates the draft and, when it passes, creates or updates the method. */
  const save = async () => {
    setAttempted(true);
    setServerError("");
    if (!check.valid) return;
    const fields = { ...check.method, preferred: draft.preferred };
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
    templateKey,
    /**
     * Starts the form over from another starting point. Only offered while
     * adding, where the form has nothing saved to lose.
     *
     * @param nextTemplateKey - The starting point picked.
     */
    pickTemplate: (nextTemplateKey: string) => {
      const nextDraft = templateDraft(nextTemplateKey, defaultCurrency);
      setTemplateKey(nextTemplateKey);
      setDraft(nextDraft);
      setLastCurrency(nextDraft.currency || defaultCurrency);
      setAttempted(false);
      setServerError("");
    },
    draft,
    errors,
    serverError,
    /** Kinds a detail row of this method may be switched between. */
    kinds: selectableDetailKinds(draft.preset),
    canAddDetail: canAddDetail(draft),
    setName: (name: string) => patchDraft({ name }),
    setNote: (note: string) => patchDraft({ note }),
    setPreferred: (preferred: boolean) => patchDraft({ preferred }),
    /**
     * Picks the one currency the method works in.
     *
     * @param currency - ISO 4217 code.
     */
    setCurrency: (currency: string) => {
      setLastCurrency(currency);
      patchDraft({ currency });
    },
    anyCurrency: draft.currency === "",
    /**
     * Switches between one currency and any currency.
     *
     * @param anyCurrency - True when the method works in every currency.
     */
    setAnyCurrency: (anyCurrency: boolean) =>
      patchDraft({ currency: anyCurrency ? "" : lastCurrency }),
    /** What the "preferred" box and its hint call this method's currency. */
    currencyName: draft.currency || ANY_CURRENCY_LABEL.toLowerCase() + " currency",
    /** Name of the method that would lose its star to this one; empty when none would. */
    displacedName: displaced?.name ?? "",
    /**
     * Switches a row to another kind of detail.
     *
     * @param rowId - The row to change.
     * @param kindKey - The kind picked.
     */
    setDetailKind: (rowId: string, kindKey: string) =>
      changeDetail(rowId, (detail) => withDetailKind(detail, kindKey)),
    /**
     * Changes what is typed in a row.
     *
     * @param rowId - The row to change.
     * @param patch - The typed fields that changed.
     */
    setDetail: (rowId: string, patch: Partial<DetailDraft>) =>
      changeDetail(rowId, (detail) => ({ ...detail, ...patch })),
    addDetail: () =>
      setDraft((current) => ({
        ...current,
        details: [
          ...current.details,
          detailDraft({ kind: nextDetailKind(current), label: "", value: "" }),
        ],
      })),
    /**
     * Drops a row from the form.
     *
     * @param rowId - The row to drop.
     */
    removeDetail: (rowId: string) =>
      setDraft((current) => ({
        ...current,
        details: current.details.filter((detail) => detail.rowId !== rowId),
      })),
    save: () => void save(),
    isSaving: create.isPending || update.isPending,
    confirmingRemove,
    askRemove: () => setConfirmingRemove(true),
    cancelRemove: () => setConfirmingRemove(false),
    removeMethod: () => void removeMethod(),
    isRemoving: remove.isPending,
  };
}
