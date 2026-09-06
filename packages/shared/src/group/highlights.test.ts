/** Unit tests for the dashboard's group ordering and cap. */

import { describe, expect, it } from "vitest";
import { DASHBOARD_GROUP_LIMIT, groupHighlights } from "./highlights";

/** The slice of a group summary these tests care about. */
interface Summary {
  /** Group name, used to assert ordering readably. */
  name: string;
  /** The viewer's net position in the group. */
  yourNetCents: number;
}

/**
 * Builds a group summary with only the fields the ordering looks at.
 *
 * @param name - Group name, used to assert ordering readably.
 * @param yourNetCents - The viewer's net position in the group.
 * @returns A summary for {@link groupHighlights}.
 */
function summary(name: string, yourNetCents: number): Summary {
  return { name, yourNetCents };
}

/**
 * Reads back the group names in the order they were returned.
 *
 * @param summaries - Result of {@link groupHighlights}.
 * @returns The group names.
 */
function names(summaries: Summary[]): string[] {
  return summaries.map((entry) => entry.name);
}

describe("groupHighlights", () => {
  it("puts the biggest balance first whichever way it points", () => {
    // Sorting by the signed number would rank a $90 debt below a $5 credit,
    // which is backwards: the debt is the thing you opened the page about.
    const ordered = groupHighlights([
      summary("small credit", 500),
      summary("big debt", -9000),
      summary("mid credit", 4000),
    ]);
    expect(names(ordered)).toEqual(["big debt", "mid credit", "small credit"]);
  });

  it("sinks settled groups below every group with a balance", () => {
    const ordered = groupHighlights([
      summary("settled", 0),
      summary("owes you a little", 100),
    ]);
    expect(names(ordered)).toEqual(["owes you a little", "settled"]);
  });

  it("keeps settled groups when nothing else fills the space", () => {
    // The dashboard reports where you stand, and standing at zero is a
    // legitimate answer — an all-settled user should still see their groups.
    expect(groupHighlights([summary("a", 0), summary("b", 0)])).toHaveLength(2);
  });

  it("caps the list so the dashboard cannot grow without bound", () => {
    const many = Array.from({ length: 9 }, (unused, index) =>
      summary(`group ${index}`, -index * 100),
    );
    expect(groupHighlights(many)).toHaveLength(DASHBOARD_GROUP_LIMIT);
  });

  it("leaves the caller's array untouched", () => {
    // The same array is TanStack Query's cached value; sorting it in place
    // would reorder the groups page as a side effect of rendering the home page.
    const original = [summary("a", 100), summary("b", -900)];
    groupHighlights(original);
    expect(names(original)).toEqual(["a", "b"]);
  });
});
