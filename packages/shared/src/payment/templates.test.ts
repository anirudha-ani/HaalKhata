/** Unit tests for the starting points of a new payment method. */

import { describe, expect, test } from "vitest";
import { DETAIL_KIND_KEYS } from "./detailKinds";
import {
  METHOD_TEMPLATES,
  PRESET_KEYS,
  allowedDetailKinds,
  draftFromTemplate,
  isPreset,
} from "./templates";
import { checkPaymentMethod } from "./validateMethod";

describe("method templates", () => {
  test("offers the open-ended starting points first, then the built-in apps", () => {
    expect(METHOD_TEMPLATES.map((template) => template.key)).toEqual([
      "wallet",
      "bank",
      "venmo",
      "zelle",
      "cashapp",
      "paypal",
      "custom",
    ]);
    expect(PRESET_KEYS).toEqual(["venmo", "zelle", "cashapp", "paypal"]);
  });

  test("every row a template opens with is a real kind the template allows", () => {
    for (const template of METHOD_TEMPLATES) {
      for (const kindKey of template.detailKinds) {
        expect(DETAIL_KIND_KEYS).toContain(kindKey);
        if (template.allowedKinds.length > 0) expect(template.allowedKinds).toContain(kindKey);
      }
    }
  });

  test("only the built-in apps narrow the kinds a detail may take", () => {
    expect(allowedDetailKinds("zelle")).toEqual(["email", "phone"]);
    expect(allowedDetailKinds("")).toEqual([]);
    expect(isPreset("venmo")).toBe(true);
    expect(isPreset("bank")).toBe(false);
    expect(isPreset("")).toBe(false);
  });
});

describe("draftFromTemplate", () => {
  test("an open-ended template starts on the person's own currency", () => {
    const draft = draftFromTemplate("bank", "BDT");
    expect(draft.currency).toBe("BDT");
    expect(draft.preset).toBe("");
    expect(draft.details.map((detail) => detail.kind)).toEqual([
      "account_name",
      "bank_name",
      "account_type",
      "account_number",
      "routing_number",
      "swift",
    ]);
    expect(draft.details.every((detail) => detail.value === "")).toBe(true);
  });

  test("a built-in app brings its name and currency, and PayPal works in any", () => {
    expect(draftFromTemplate("venmo", "BDT")).toMatchObject({
      name: "Venmo",
      currency: "USD",
      preset: "venmo",
    });
    expect(draftFromTemplate("paypal", "BDT").currency).toBe("");
    expect(draftFromTemplate("cashapp", "BDT").name).toBe("Cash App");
  });

  test("an unknown key falls back to the free-form starting point", () => {
    expect(draftFromTemplate("nope", "USD").details).toEqual([
      { kind: "custom", label: "", value: "" },
    ]);
  });

  test("a filled-in draft from every template passes the validator", () => {
    const samples: Record<string, string> = {
      phone: "+8801712345678",
      email: "jordan@example.com",
      username: "jordanlee",
      account_name: "Jordan Lee",
      bank_name: "Example Bank",
      account_type: "savings",
      account_number: "000123454821",
      routing_number: "000000000",
      swift: "ABCDUS33",
      custom: "anything",
    };
    for (const template of METHOD_TEMPLATES) {
      const draft = draftFromTemplate(template.key, "USD");
      const check = checkPaymentMethod({
        ...draft,
        name: draft.name || "My method",
        details: draft.details.map((detail) => ({
          ...detail,
          label: detail.kind === "custom" ? "Reference" : "",
          value: samples[detail.kind] ?? "",
        })),
      });
      expect(check.errors, template.key).toEqual({ detailRows: {} });
    }
  });
});
