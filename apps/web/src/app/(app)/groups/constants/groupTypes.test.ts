/** Unit tests for the group list's balance filter and its empty-state message. */

import { describe, expect, it } from "vitest";
import {
  GROUP_BALANCE_FILTERS,
  matchesBalanceFilter,
  noGroupsMessage,
} from "./groupTypes";

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

describe("noGroupsMessage", () => {
  it("names the search term when that is what is hiding rows", () => {
    expect(noGroupsMessage("goa", "all")).toBe("No groups match “goa”.");
  });

  it("names the filter when the search box is empty", () => {
    // The bug this replaces: reporting the query regardless produced
    // `No groups match “”.` — empty quotes — whenever a filter emptied the
    // list on its own.
    expect(noGroupsMessage("", "owe")).toBe("No groups where you owe anything.");
    expect(noGroupsMessage("", "owed")).toBe("No groups where anyone owes you.");
  });

  it("names both when both are narrowing", () => {
    expect(noGroupsMessage("goa", "owe")).toBe("No groups match “goa” where you owe anything.");
  });

  it("never renders empty quotes", () => {
    for (const filter of ["all", "owed", "owe"] as const) {
      expect(noGroupsMessage("", filter)).not.toContain("“”");
    }
  });
});
