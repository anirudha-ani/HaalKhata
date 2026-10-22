/** Currency mismatch guards for receipt imports on both renderers. */
import { expect, it } from "vitest";
import { receiptCurrencyError } from "./receiptCurrency";

it.each([["USD", "JPY"], ["EUR", "USD"], ["KWD", "USD"]])("refuses silent %s-to-%s reinterpretation", (receipt, expense) => {
  expect(receiptCurrencyError(receipt, expense)).toContain(`receipt is in ${receipt}`);
  expect(receiptCurrencyError(receipt, expense)).toContain(`manually in ${expense}`);
});
it("accepts matching or unknown currencies without inventing a conversion", () => {
  expect(receiptCurrencyError(" usd ", "USD")).toBe("");
  expect(receiptCurrencyError("", "JPY")).toBe("");
});
