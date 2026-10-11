/** The add-and-edit payment method form as plain state and transitions, so the web and the mobile app run one form and only draw it differently. */

import { methodCurrencyPhrase } from "./formatMethod";
import { DEFAULT_TEMPLATE_KEY, templateKeyForCurrency } from "./templates";
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
} from "./methodDraft";
import type { PaymentMethodFields } from "./types";
import {
  checkPaymentMethod,
  type PaymentMethodCheck,
  type PaymentMethodErrors,
} from "./validateMethod";

/** Everything the form remembers between renders. */
export interface MethodFormState {
  /** Key of the starting point the form is shaped by; only meaningful while adding. */
  templateKey: string;
  /** The method as typed so far. */
  draft: MethodDraft;
  /** What "one currency" goes back to after "any currency" is ticked and unticked. */
  lastCurrency: string;
  /**
   * The currency a starting point without its own opens on: the owner's
   * default, or the currency the form was opened for.
   */
  defaultCurrency: string;
  /**
   * Whether a save has been attempted. Errors are shown only after it: a
   * form that opens covered in "give this method a name" is scolding someone
   * who has not typed yet.
   */
  attempted: boolean;
}

/** One thing a person can do to the form. */
export type MethodFormAction =
  | { type: "pickTemplate"; templateKey: string }
  | { type: "setName"; name: string }
  | { type: "setNote"; note: string }
  | { type: "setPreferred"; preferred: boolean }
  | { type: "setCurrency"; currency: string }
  | { type: "setAnyCurrency"; anyCurrency: boolean }
  | { type: "setDetailKind"; rowId: string; kindKey: string }
  | { type: "setDetail"; rowId: string; patch: Partial<DetailDraft> }
  | { type: "addDetail" }
  | { type: "removeDetail"; rowId: string }
  | { type: "attemptSave" };

/** A stored method as the form needs it to tell whose star would be displaced. */
export interface StarredMethod {
  id: string;
  name: string;
  /** ISO 4217 code; "" means any currency. */
  currency: string;
  preferred: boolean;
}

/** Everything a form draws that is worked out from its state rather than stored. */
export interface MethodFormView {
  /** The validator's verdict on the draft, including the cleaned method to send. */
  check: PaymentMethodCheck;
  /** The errors to show: none before the first save attempt, the validator's after. */
  errors: PaymentMethodErrors;
  /** Kinds a detail row of this method may be switched between. */
  kinds: readonly string[];
  /** Whether "Add another detail" is offered. */
  canAddDetail: boolean;
  /** Whether a detail row can be dropped: not a built-in app's one detail, and not the last row. */
  canRemoveDetail: boolean;
  /** Whether the method works in every currency. */
  anyCurrency: boolean;
  /** What the "preferred" box calls the method's currency: a code, or "any currency". */
  currencyName: string;
  /** Name of the method that would lose its star to this one; "" when none would. */
  displacedName: string;
}

/** What the form shows before the first save attempt: no errors at all. */
const NO_ERRORS: PaymentMethodErrors = { detailRows: {} };

/**
 * Builds the form's first state.
 *
 * Adding normally opens on the first starting point in the owner's default
 * currency. When the form was opened to answer "how do you want to be paid
 * in this currency?" (`forCurrency`), it opens on a shape that works in that
 * currency instead, and every open-ended starting point picked afterwards
 * stays in it.
 *
 * @param method - The stored method being edited, or undefined to add one.
 * @param defaultCurrency - The owner's default currency.
 * @param forCurrency - The currency a new method is wanted for, when the
 *   form was opened for one; ignored when editing.
 * @returns The state the form opens with.
 */
export function initialMethodForm(
  method: (PaymentMethodFields & { preferred: boolean }) | undefined,
  defaultCurrency: string,
  forCurrency = "",
): MethodFormState {
  const startCurrency = forCurrency || defaultCurrency;
  const templateKey = forCurrency ? templateKeyForCurrency(forCurrency) : DEFAULT_TEMPLATE_KEY;
  return {
    templateKey,
    draft: method ? methodDraft(method, method.preferred) : templateDraft(templateKey, startCurrency),
    lastCurrency: method?.currency || startCurrency,
    defaultCurrency: startCurrency,
    attempted: false,
  };
}

/**
 * Replaces one detail row of a draft.
 *
 * @param draft - The draft to change.
 * @param rowId - The row to replace.
 * @param change - Builds the new row from the current one.
 * @returns The draft with that row changed.
 */
function withDetail(
  draft: MethodDraft,
  rowId: string,
  change: (detail: DetailDraft) => DetailDraft,
): MethodDraft {
  return {
    ...draft,
    details: draft.details.map((detail) => (detail.rowId === rowId ? change(detail) : detail)),
  };
}

/**
 * Applies one action to the form.
 *
 * @param state - The form as it stands.
 * @param action - What the person did.
 * @returns The form afterwards.
 */
export function methodFormReducer(
  state: MethodFormState,
  action: MethodFormAction,
): MethodFormState {
  const { draft } = state;
  switch (action.type) {
    case "pickTemplate": {
      // Starting over from another shape: nothing typed is kept, and the
      // form is quiet again until the next save attempt.
      const nextDraft = templateDraft(action.templateKey, state.defaultCurrency);
      return {
        ...state,
        templateKey: action.templateKey,
        draft: nextDraft,
        lastCurrency: nextDraft.currency || state.defaultCurrency,
        attempted: false,
      };
    }
    case "setName":
      return { ...state, draft: { ...draft, name: action.name } };
    case "setNote":
      return { ...state, draft: { ...draft, note: action.note } };
    case "setPreferred":
      return { ...state, draft: { ...draft, preferred: action.preferred } };
    case "setCurrency":
      return {
        ...state,
        lastCurrency: action.currency,
        draft: { ...draft, currency: action.currency },
      };
    case "setAnyCurrency":
      return {
        ...state,
        draft: { ...draft, currency: action.anyCurrency ? "" : state.lastCurrency },
      };
    case "setDetailKind":
      return {
        ...state,
        draft: withDetail(draft, action.rowId, (detail) => withDetailKind(detail, action.kindKey)),
      };
    case "setDetail":
      return {
        ...state,
        draft: withDetail(draft, action.rowId, (detail) => ({ ...detail, ...action.patch })),
      };
    case "addDetail":
      if (!canAddDetail(draft)) return state;
      return {
        ...state,
        draft: {
          ...draft,
          details: [
            ...draft.details,
            detailDraft({ kind: nextDetailKind(draft), label: "", value: "" }),
          ],
        },
      };
    case "removeDetail":
      return {
        ...state,
        draft: {
          ...draft,
          details: draft.details.filter((detail) => detail.rowId !== action.rowId),
        },
      };
    case "attemptSave":
      return { ...state, attempted: true };
  }
}

/**
 * Works out everything the form draws from its state.
 *
 * Validation runs every time, with the validator the server uses, so the
 * messages follow the typing once they are showing and each one disappears
 * as its field is fixed.
 *
 * @param state - The form as it stands.
 * @param methods - All of the owner's stored methods.
 * @param editingId - Id of the method being edited; "" when adding.
 * @returns The derived view.
 */
export function readMethodForm(
  state: MethodFormState,
  methods: readonly StarredMethod[],
  editingId: string,
): MethodFormView {
  const { draft } = state;
  const check = checkPaymentMethod(draftFields(draft));
  // Starring this method takes the star from whichever method holds it for
  // the same currency. Said before saving, not discovered in the list after.
  const displaced = draft.preferred
    ? methods.find(
        (other) =>
          other.preferred && other.id !== editingId && other.currency === check.method.currency,
      )
    : undefined;
  return {
    check,
    errors: state.attempted ? check.errors : NO_ERRORS,
    kinds: selectableDetailKinds(draft.preset),
    canAddDetail: canAddDetail(draft),
    canRemoveDetail: draft.preset === "" && draft.details.length > 1,
    anyCurrency: draft.currency === "",
    currencyName: methodCurrencyPhrase(draft),
    displacedName: displaced?.name ?? "",
  };
}
