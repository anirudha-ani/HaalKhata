/** An expense form works in the saved currency when editing, and the group's or the profile's when new. */
import { expect, it } from "vitest";
import { expenseFormCurrency } from "./formCurrency";
import { centsToInput, parseMoneyInput } from "../../money/money";

it.each(["JPY", "KWD", "EUR"])("round-trips the saved %s minor units despite a USD profile", (currency) => {
  const selected = expenseFormCurrency(undefined, currency, "USD");
  expect(selected).toBe(currency);
  expect(parseMoneyInput(centsToInput(1001, currency), selected)).toBe(1001);
});
it("uses the profile only for new one-off expenses, and the group's currency for new group expenses", () => {
  expect(expenseFormCurrency(undefined, undefined, "EUR")).toBe("EUR");
  expect(expenseFormCurrency("JPY", undefined, "EUR")).toBe("JPY");
  expect(expenseFormCurrency(undefined, undefined, undefined)).toBe("USD");
});
it("keeps an edited expense in its saved currency even where its group's currency differs", () => {
  expect(expenseFormCurrency("JPY", "USD", "EUR")).toBe("USD");
});
