/** Unit tests for the group list's balance filter predicate. */

import { describe, expect, it } from "vitest";
import { GROUP_BALANCE_FILTERS, matchesBalanceFilter } from "./groupTypes";

describe("matchesBalanceFilter", () => {
  it("shows everything under 'all', whichever way the money points", () => {
    for (const netCents of [-500, 0, 500]) {
      expect(matchesBalanceFilter(netCents, "all")).toBe(true);
    }
  });

  it("'owed to you' takes only positive positions", () => {
    expect(matchesBalanceFilter(2522, "owed")).toBe(true);
    expect(matchesBalanceFilter(-2522, "owed")).toBe(false);
  });

  it("'you owe' takes only negative positions", () => {
    expect(matchesBalanceFilter(-2522, "owe")).toBe(true);
    expect(matchesBalanceFilter(2522, "owe")).toBe(false);
  });

  it("a settled group appears under neither, never both", () => {
    // The boundary worth pinning: >= or <= here would surface every settled
    // group in both filtered lists — precisely the rows being filtered away.
    expect(matchesBalanceFilter(0, "owed")).toBe(false);
    expect(matchesBalanceFilter(0, "owe")).toBe(false);
  });

  it("every offered filter is handled, so a new button cannot fall through", () => {
    for (const option of GROUP_BALANCE_FILTERS) {
      expect(typeof matchesBalanceFilter(1, option.value)).toBe("boolean");
    }
  });
});
