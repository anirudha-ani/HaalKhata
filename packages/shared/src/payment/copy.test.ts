/** Unit tests for the payment wording both apps share. */

import { describe, expect, test } from "vitest";
import {
  CUSTOM_LABEL_PLACEHOLDER,
  EMPTY_METHODS_HINT,
  METHOD_NAME_PLACEHOLDER,
  METHOD_NOTE_PLACEHOLDER,
  finishOnboardingLabel,
} from "./copy";

/** Terms from outside the US: welcome in an example, never the first thing in it. */
const REGIONAL_TERMS = ["bKash", "UPI", "IFSC", "Nagad"];

/**
 * Finds where the first regional term sits in a line of copy.
 *
 * @param line - The copy to search.
 * @returns The index of the earliest regional term, or -1 when there is none.
 */
function firstRegionalTerm(line: string): number {
  const found = REGIONAL_TERMS.map((term) => line.indexOf(term)).filter((index) => index >= 0);
  return found.length > 0 ? Math.min(...found) : -1;
}

describe("payment copy", () => {
  test("an example leads with what people in the US use", () => {
    expect(EMPTY_METHODS_HINT.indexOf("Venmo")).toBeGreaterThanOrEqual(0);
    expect(EMPTY_METHODS_HINT.indexOf("Venmo")).toBeLessThan(firstRegionalTerm(EMPTY_METHODS_HINT));
    expect(METHOD_NAME_PLACEHOLDER.indexOf("Chase")).toBeLessThan(
      firstRegionalTerm(METHOD_NAME_PLACEHOLDER),
    );
    expect(CUSTOM_LABEL_PLACEHOLDER.indexOf("Branch")).toBeLessThan(
      firstRegionalTerm(CUSTOM_LABEL_PLACEHOLDER),
    );
  });

  test("the note example is not an instruction from one regional wallet", () => {
    expect(firstRegionalTerm(METHOD_NOTE_PLACEHOLDER)).toBe(-1);
    expect(METHOD_NOTE_PLACEHOLDER).not.toContain("Send Money");
  });

  test("bKash and UPI are still named, so their users recognise themselves", () => {
    expect(EMPTY_METHODS_HINT).toContain("bKash");
    expect(EMPTY_METHODS_HINT).toContain("UPI");
  });
});

describe("finishOnboardingLabel", () => {
  test("says skip while nothing has been added, and only then", () => {
    expect(finishOnboardingLabel(false)).toBe("Skip and open your HaalKhata");
    expect(finishOnboardingLabel(true)).toBe("Open your HaalKhata");
  });
});
