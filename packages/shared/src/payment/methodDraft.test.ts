/** Unit tests for the payment-method form's working copy. */

import { describe, expect, test } from "vitest";
import {
  canAddDetail,
  detailDraft,
  detailDraftValue,
  draftFields,
  methodDraft,
  nextDetailKind,
  selectableDetailKinds,
  templateDraft,
  withDetailKind,
} from "./methodDraft";
import { checkPaymentMethod } from "./validateMethod";

describe("building a draft", () => {
  test("a stored phone opens as the country and national number it was entered with", () => {
    const formRow = detailDraft({ kind: "phone", label: "", value: "+8801712345678" });
    expect(formRow.region).toBe("BD");
    expect(formRow.nationalNumber).toBe("1712345678");
    expect(detailDraftValue(formRow)).toBe("+8801712345678");
  });

  test("a phone that never parsed is kept as typed instead of being lost", () => {
    const formRow = detailDraft({ kind: "phone", label: "", value: "4015550147" });
    expect(formRow.nationalNumber).toBe("4015550147");
    expect(formRow.region).toBe("US");
  });

  test("every row gets its own id", () => {
    const first = detailDraft({ kind: "email", label: "", value: "" });
    const second = detailDraft({ kind: "email", label: "", value: "" });
    expect(first.rowId).not.toBe(second.rowId);
  });

  test("a draft round-trips a stored method unchanged", () => {
    const stored = {
      name: "Chase checking",
      currency: "USD",
      preset: "",
      details: [
        { kind: "account_name", label: "", value: "Jordan Lee" },
        { kind: "phone", label: "", value: "+14155552671" },
        { kind: "custom", label: "Branch", value: "Downtown" },
      ],
      note: "Reference: dinner",
    };
    const draft = methodDraft(stored, true);
    expect(draft.preferred).toBe(true);
    expect(draftFields(draft)).toEqual(stored);
  });

  test("a template opens unstarred with its blank rows", () => {
    const draft = templateDraft("bank", "BDT");
    expect(draft).toMatchObject({ name: "", currency: "BDT", preset: "", preferred: false });
    expect(draft.details).toHaveLength(6);
    expect(draftFields(draft).details.every((detail) => detail.value === "")).toBe(true);
  });
});

describe("validating a draft", () => {
  test("an error index from the validator is the index of the row in the form", () => {
    const draft = templateDraft("bank", "USD");
    draft.name = "Chase";
    // Row 3 is the account number in the bank template; row 5 is SWIFT.
    draft.details[3]!.value = "000123454821";
    draft.details[5]!.value = "nope";

    const check = checkPaymentMethod(draftFields(draft));

    expect(Object.keys(check.errors.detailRows)).toEqual(["5"]);
    expect(draft.details[5]!.kind).toBe("swift");
  });

  test("a phone row with no digits is a blank row, not a bare dial code", () => {
    const draft = templateDraft("wallet", "BDT");
    draft.name = "bKash";
    expect(draftFields(draft).details[0]!.value).toBe("");
    expect(checkPaymentMethod(draftFields(draft)).errors.details).toBeDefined();

    draft.details[0]!.region = "BD";
    draft.details[0]!.nationalNumber = "01712-345678";
    expect(draftFields(draft).details[0]!.value).toBe("+88001712345678");
  });
});

describe("changing a row's kind", () => {
  test("typed text carries over between plain-text kinds", () => {
    const formRow = { ...detailDraft({ kind: "username", label: "", value: "jordan" }) };
    expect(withDetailKind(formRow, "account_name").value).toBe("jordan");
  });

  test("anything else starts empty, since a phone is not an email", () => {
    const username = detailDraft({ kind: "username", label: "", value: "jordan" });
    expect(withDetailKind(username, "email").value).toBe("");
    expect(withDetailKind(username, "account_type").value).toBe("");
    const phone = detailDraft({ kind: "phone", label: "", value: "+14155552671" });
    expect(withDetailKind(phone, "email")).toMatchObject({ value: "", nationalNumber: "" });
  });

  test("only a custom row keeps a label", () => {
    const custom = detailDraft({ kind: "custom", label: "IFSC", value: "HDFC0001234" });
    expect(withDetailKind(custom, "username")).toMatchObject({ label: "", value: "HDFC0001234" });
    expect(withDetailKind(custom, "custom")).toBe(custom);
  });
});

describe("what the form offers", () => {
  test("a built-in app offers only its own kinds and exactly one row", () => {
    const zelle = templateDraft("zelle", "USD");
    expect(selectableDetailKinds("zelle")).toEqual(["email", "phone"]);
    expect(canAddDetail(zelle)).toBe(false);
  });

  test("anything else offers every kind, up to eight rows", () => {
    const bank = templateDraft("bank", "USD");
    expect(selectableDetailKinds("")).toHaveLength(12);
    expect(canAddDetail(bank)).toBe(true);
    bank.details = Array.from({ length: 8 }, () =>
      detailDraft({ kind: "custom", label: "", value: "" }),
    );
    expect(canAddDetail(bank)).toBe(false);
  });

  test("a new row starts on a kind the method does not have yet", () => {
    const wallet = templateDraft("wallet", "BDT");
    expect(nextDetailKind(wallet)).toBe("email");
    const bank = templateDraft("bank", "USD");
    expect(nextDetailKind(bank)).toBe("phone");
  });
});
