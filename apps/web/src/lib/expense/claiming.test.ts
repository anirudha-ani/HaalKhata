/** Tests for the item cards' claim-mode helpers. */

import { describe, expect, it } from "vitest";
import { countClaimedItems, resolveClaimer } from "./claiming";

const people = [{ id: "you" }, { id: "ani" }, { id: "adnan" }];

describe("resolveClaimer", () => {
  it("returns whoever was picked, on any screen", () => {
    expect(resolveClaimer(people, "ani", "you", true)).toEqual({ id: "ani" });
    expect(resolveClaimer(people, "ani", "you", false)).toEqual({ id: "ani" });
  });

  it("starts a phone on the signed-in user", () => {
    expect(resolveClaimer(people, null, "you", true)).toEqual({ id: "you" });
  });

  it("leaves claiming off on a wider screen until someone is picked", () => {
    expect(resolveClaimer(people, null, "you", false)).toBeNull();
  });

  it("drops a pick who has left the expense", () => {
    expect(resolveClaimer(people, "gone", "you", true)).toEqual({ id: "you" });
    expect(resolveClaimer(people, "gone", "you", false)).toBeNull();
  });

  it("has nobody to start on when the signed-in user is not on the expense", () => {
    expect(resolveClaimer(people, null, "stranger", true)).toBeNull();
    expect(resolveClaimer([], null, "you", true)).toBeNull();
  });
});

describe("countClaimedItems", () => {
  it("counts items, not portions", () => {
    expect(
      countClaimedItems([
        { assignees: { you: 1, ani: 3 } },
        { assignees: { ani: 1 } },
        { assignees: {} },
      ]),
    ).toEqual({ you: 1, ani: 2 });
  });

  it("ignores a zero portion left behind by an unchecked box", () => {
    expect(countClaimedItems([{ assignees: { you: 0, ani: 1 } }])).toEqual({ ani: 1 });
  });
});
