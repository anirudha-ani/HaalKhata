/** Unit tests for spotting labels that ask for a secret. */

import { describe, expect, test } from "vitest";
import { namesSecret } from "./secrets";

describe("namesSecret", () => {
  test.each([
    "PIN",
    "pin",
    "UPI PIN",
    "MPIN",
    "ATM pin",
    "PINs",
    "pin code",
    "Password",
    "Online banking password",
    "Passcode",
    "CVV",
    "CVV2",
    "Card CVC",
    "OTP",
    "Security code",
    "Card security code",
    "Card number",
    "Card no",
    "cardnumber",
    "Debit card",
    "Credit Card Number",
    "Card expiry",
    "Expiry date",
  ])("refuses %s", (label) => {
    expect(namesSecret(label)).toBe(true);
  });

  test.each(["P I N", "p.i.n", "P-I-N", "ＰＩＮ", "C V V", "Card  -  Number"])(
    "reads through the disguise in %s",
    (label) => {
      expect(namesSecret(label)).toBe(true);
    },
  );

  test.each([
    "Branch",
    "IFSC",
    "Sort code",
    "BSB",
    "Postal code",
    "Pincode",
    "Shipping",
    "Opinion",
    "Spinning",
    "Reference",
    "Wallet number",
    "Customer ID",
    "Transit number",
    "UPI ID",
    "Account nickname",
    "A B C",
    "",
  ])("accepts %s", (label) => {
    expect(namesSecret(label)).toBe(false);
  });
});

describe("namesSecret reads letters that only look different", () => {
  test.each([
    ["Greek capitals", "ΡΙΝ"],
    ["a Cyrillic letter", "РIN"],
    ["a digit for a letter", "P1N"],
    ["Cyrillic in a phrase", "Сard number"],
    ["a zero for an o", "0TP"],
    ["spaced lookalikes", "Р І Ν"],
  ])("%s", (_case, label) => {
    expect(namesSecret(label)).toBe(true);
  });

  test.each(["Opinion", "Account 1", "Branch 305", "Банк", "Название", "IBAN", "Reference 5"])("leaves %s alone", (label) => {
    expect(namesSecret(label)).toBe(false);
  });
});
