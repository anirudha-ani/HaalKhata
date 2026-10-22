/** Regression tests for editing historical expenses after a profile-currency change. */
import { expect, it } from "vitest";
import { expenseFormCurrency } from "./formCurrency";
import { centsToInput, parseMoneyInput } from "../../money/money";

it.each(["JPY", "KWD", "EUR"])("round-trips the saved %s minor units despite a USD profile", (currency) => {
  const selected = expenseFormCurrency(undefined, currency, "USD");
  expect(selected).toBe(currency);
  expect(parseMoneyInput(centsToInput(1001, currency), selected)).toBe(1001);
});
it("uses the profile only for new one-off expenses and respects the selected group", () => {
  expect(expenseFormCurrency(undefined, undefined, "EUR")).toBe("EUR");
  expect(expenseFormCurrency("JPY", "USD", "EUR")).toBe("JPY");
  expect(expenseFormCurrency(undefined, undefined, undefined)).toBe("USD");
});
