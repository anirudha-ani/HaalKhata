/** Tests for the avatar stack's slot arithmetic. */

import { describe, expect, it } from "vitest";
import { capStack } from "./capStack";

const people = ["ani", "adnan", "dot", "jess", "leo", "sam", "nila"];

describe("capStack", () => {
  it("shows everyone when they fit", () => {
    expect(capStack(people.slice(0, 3), 4)).toEqual({ shown: ["ani", "adnan", "dot"], hiddenCount: 0 });
    expect(capStack(people.slice(0, 4), 4)).toEqual({
      shown: ["ani", "adnan", "dot", "jess"],
      hiddenCount: 0,
    });
  });

  it("gives the last slot to the count once the list is too long", () => {
    expect(capStack(people, 4)).toEqual({ shown: ["ani", "adnan", "dot"], hiddenCount: 4 });
  });

  it("never hides exactly one person behind a slot that could have shown them", () => {
    // Five people in four slots: three faces and "+2", not four faces and "+1".
    expect(capStack(people.slice(0, 5), 4).hiddenCount).toBe(2);
  });

  it("handles an empty list and a stack with no room", () => {
    expect(capStack([], 4)).toEqual({ shown: [], hiddenCount: 0 });
    expect(capStack(people, 0)).toEqual({ shown: [], hiddenCount: 7 });
  });
});
