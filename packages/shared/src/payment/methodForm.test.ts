/** Unit tests for the payment method form's state and transitions. */

import { describe, expect, test } from "vitest";
import {
  initialMethodForm,
  methodFormReducer,
  readMethodForm,
  type MethodFormAction,
  type MethodFormState,
} from "./methodForm";

/**
 * Opens the add form and switches it to the wallet starting point, the
 * open-ended shape most of these tests exercise.
 *
 * @param defaultCurrency - The owner's default currency.
 * @returns The form, shaped as a wallet and not yet typed in.
 */
function walletForm(defaultCurrency: string): MethodFormState {
  return methodFormReducer(initialMethodForm(undefined, defaultCurrency), {
    type: "pickTemplate",
    templateKey: "wallet",
  });
}

/**
 * Applies a run of actions to a form.
 *
 * @param state - Where the form starts.
 * @param actions - What the person does, in order.
 * @returns Where the form ends up.
 */
function after(state: MethodFormState, ...actions: MethodFormAction[]): MethodFormState {
  return actions.reduce(methodFormReducer, state);
}

const STORED = [
  { id: "method-bkash", name: "bKash", currency: "BDT", preferred: true },
  { id: "method-chase", name: "Chase checking", currency: "USD", preferred: true },
  { id: "method-paypal", name: "PayPal", currency: "", preferred: false },
];

describe("opening the form", () => {
  test("adding opens on the first starting point, Venmo, quiet", () => {
    const state = initialMethodForm(undefined, "BDT");
    expect(state.templateKey).toBe("venmo");
    // A built-in app brings its own name and currency, whatever the owner's is.
    expect(state.draft).toMatchObject({
      name: "Venmo",
      currency: "USD",
      preset: "venmo",
      preferred: false,
    });
    expect(state.draft.details.map((detail) => detail.kind)).toEqual(["username"]);
    expect(readMethodForm(state, STORED, "").errors).toEqual({ detailRows: {} });
  });

  test("an open-ended starting point takes the owner's currency", () => {
    const state = walletForm("BDT");
    expect(state.draft).toMatchObject({ name: "", currency: "BDT", preset: "", preferred: false });
    expect(state.draft.details.map((detail) => detail.kind)).toEqual(["phone"]);
  });

  test("editing opens on the stored method, star included", () => {
    const state = initialMethodForm(
      {
        name: "bKash",
        currency: "BDT",
        preset: "",
        details: [{ kind: "phone", label: "", value: "+8801712345678" }],
        note: "Use Send Money",
        preferred: true,
      },
      "USD",
    );
    expect(state.draft).toMatchObject({ name: "bKash", currency: "BDT", preferred: true });
    expect(state.draft.details[0]).toMatchObject({ region: "BD", nationalNumber: "1712345678" });
    expect(readMethodForm(state, STORED, "method-bkash").check.valid).toBe(true);
  });
});

describe("errors", () => {
  test("stay hidden until a save is attempted, then follow the typing", () => {
    const opened = walletForm("USD");
    const attempted = after(opened, { type: "attemptSave" });
    expect(readMethodForm(attempted, STORED, "").errors.name).toBe("give this method a name");
    const named = after(attempted, { type: "setName", name: "bKash" });
    expect(readMethodForm(named, STORED, "").errors.name).toBeUndefined();
  });

  test("picking another starting point quiets the form again", () => {
    const attempted = after(initialMethodForm(undefined, "USD"), { type: "attemptSave" });
    const switched = after(attempted, { type: "pickTemplate", templateKey: "bank" });
    expect(switched.attempted).toBe(false);
    expect(switched.draft.details).toHaveLength(6);
    expect(readMethodForm(switched, STORED, "").errors).toEqual({ detailRows: {} });
  });
});

describe("currency", () => {
  test("any currency remembers the one it replaced", () => {
    const state = after(
      walletForm("USD"),
      { type: "setCurrency", currency: "BDT" },
      { type: "setAnyCurrency", anyCurrency: true },
    );
    expect(state.draft.currency).toBe("");
    expect(readMethodForm(state, STORED, "")).toMatchObject({
      anyCurrency: true,
      currencyName: "any currency",
    });
    expect(after(state, { type: "setAnyCurrency", anyCurrency: false }).draft.currency).toBe("BDT");
  });

  test("a built-in app that works anywhere goes back to the owner's currency when narrowed", () => {
    const paypal = after(initialMethodForm(undefined, "BDT"), {
      type: "pickTemplate",
      templateKey: "paypal",
    });
    expect(paypal.draft.currency).toBe("");
    expect(after(paypal, { type: "setAnyCurrency", anyCurrency: false }).draft.currency).toBe("BDT");
  });
});

describe("details", () => {
  test("rows are added on a kind the method lacks, changed and removed by id", () => {
    const opened = walletForm("BDT");
    const added = after(opened, { type: "addDetail" });
    expect(added.draft.details.map((detail) => detail.kind)).toEqual(["phone", "email"]);
    const [phoneRow, emailRow] = added.draft.details;

    const typed = after(added, {
      type: "setDetail",
      rowId: emailRow!.rowId,
      patch: { value: "rahim@example.com" },
    });
    expect(typed.draft.details[1]!.value).toBe("rahim@example.com");
    expect(typed.draft.details[0]).toBe(phoneRow);

    const rekinded = after(typed, {
      type: "setDetailKind",
      rowId: emailRow!.rowId,
      kindKey: "username",
    });
    expect(rekinded.draft.details[1]).toMatchObject({ kind: "username", value: "" });

    const removed = after(rekinded, { type: "removeDetail", rowId: phoneRow!.rowId });
    expect(removed.draft.details.map((detail) => detail.kind)).toEqual(["username"]);
  });

  test("a built-in app keeps its one row", () => {
    const venmo = after(initialMethodForm(undefined, "USD"), {
      type: "pickTemplate",
      templateKey: "venmo",
    });
    const view = readMethodForm(venmo, STORED, "");
    expect(view.canAddDetail).toBe(false);
    expect(view.canRemoveDetail).toBe(false);
    expect(view.kinds).toEqual(["username"]);
    expect(after(venmo, { type: "addDetail" })).toBe(venmo);
  });

  test("the last row of any method cannot be dropped", () => {
    const wallet = walletForm("BDT");
    expect(readMethodForm(wallet, STORED, "").canRemoveDetail).toBe(false);
    expect(readMethodForm(after(wallet, { type: "addDetail" }), STORED, "").canRemoveDetail).toBe(true);
  });
});

describe("the star", () => {
  /**
   * Builds a filled-in new method in a currency, with the box ticked.
   *
   * @param currency - ISO code, or "" for any currency.
   * @returns The form state.
   */
  const starredIn = (currency: string) =>
    after(
      walletForm("USD"),
      { type: "setName", name: "Nagad" },
      currency === ""
        ? { type: "setAnyCurrency", anyCurrency: true }
        : { type: "setCurrency", currency },
      { type: "setPreferred", preferred: true },
    );

  test("names the method that would lose its star in the same currency", () => {
    expect(readMethodForm(starredIn("BDT"), STORED, "").displacedName).toBe("bKash");
    expect(readMethodForm(starredIn("USD"), STORED, "").displacedName).toBe("Chase checking");
  });

  test("displaces nothing in a currency nobody starred, or when the box is clear", () => {
    expect(readMethodForm(starredIn("EUR"), STORED, "").displacedName).toBe("");
    expect(readMethodForm(starredIn(""), STORED, "").displacedName).toBe("");
    const unticked = after(starredIn("BDT"), { type: "setPreferred", preferred: false });
    expect(readMethodForm(unticked, STORED, "").displacedName).toBe("");
  });

  test("a method does not displace itself", () => {
    expect(readMethodForm(starredIn("BDT"), STORED, "method-bkash").displacedName).toBe("");
  });
});
