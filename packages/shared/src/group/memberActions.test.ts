/** Unit tests for the member-action confirmation wording. */

import { describe, expect, it } from "vitest";
import { memberActionPrompt, memberRemovalBlock } from "./memberActions";

describe("memberActionPrompt", () => {
  it("names the person being removed", () => {
    expect(memberActionPrompt("remove", "Radhika Sen", false)).toEqual({
      question: "Remove Radhika Sen from the group?",
      detail: "They lose access to it until a member adds them back.",
      confirmLabel: "Remove",
    });
  });

  it("reads a removal of yourself as leaving", () => {
    // One RPC, two readings: nobody "removes" themselves.
    const prompt = memberActionPrompt("remove", "Anirudha Paul", true);
    expect(prompt.question).toBe("Leave this group?");
    expect(prompt.confirmLabel).toBe("Leave group");
    expect(prompt.question).not.toContain("Anirudha");
  });

  it("says who can undo a hand-over", () => {
    const prompt = memberActionPrompt("transfer", "Tarun Rajnish", false);
    expect(prompt.question).toBe("Make Tarun Rajnish the owner?");
    expect(prompt.detail).toContain("only they can hand the group back");
    expect(prompt.confirmLabel).toBe("Make owner");
  });

  it("keeps the confirm caption the same as the button that opened it", () => {
    // The second tap should read as the first one did, so it is recognisably
    // the same decision and not a new one.
    expect(memberActionPrompt("remove", "Leo", false).confirmLabel).toBe("Remove");
    expect(memberActionPrompt("remove", "Leo", true).confirmLabel).toBe("Leave group");
    expect(memberActionPrompt("transfer", "Leo", false).confirmLabel).toBe("Make owner");
  });
});

describe("memberRemovalBlock", () => {
  it("lets a settled member go", () => {
    expect(memberRemovalBlock("Radhika Sen", false, [])).toBeNull();
    expect(memberRemovalBlock("Anirudha Paul", true, [])).toBeNull();
  });

  it("tells someone leaving what they owe", () => {
    expect(memberRemovalBlock("Anirudha Paul", true, [{ currency: "USD", cents: -5239 }])).toEqual({
      title: "You can't leave this group yet",
      detail: "You owe $52.39 here. Settle up first, then you can leave.",
    });
  });

  it("tells someone leaving what they are owed", () => {
    // Being owed money blocks leaving just the same: the net has to be zero.
    const block = memberRemovalBlock("Anirudha Paul", true, [{ currency: "USD", cents: 88000 }]);
    expect(block?.detail).toBe("You are owed $880.00 here. Once that is settled you can leave.");
  });

  it("names the member an owner is trying to remove, in either direction", () => {
    expect(memberRemovalBlock("Diego Fernandez", false, [{ currency: "USD", cents: 88000 }])).toEqual({
      title: "Diego Fernandez can't be removed yet",
      detail: "They are owed $880.00 in this group. That has to be settled first.",
    });
    expect(memberRemovalBlock("Leo Chen", false, [{ currency: "EUR", cents: -1250 }])?.detail).toBe(
      "They owe €12.50 in this group. That has to be settled first.",
    );
  });

  it("names both balances when a member owes in one currency and is owed in another", () => {
    // A dollar owed and a euro paid back in the same group are two balances,
    // not one that cancels (a payment recorded in euros before group
    // payments were kept to the group's currency).
    const buckets = [
      { currency: "USD", cents: -10000 },
      { currency: "EUR", cents: 10000 },
    ];
    expect(memberRemovalBlock("Ben Ito", true, buckets)?.detail).toBe(
      "You owe $100.00 and are owed €100.00 here. Both have to be settled before you can leave.",
    );
    expect(memberRemovalBlock("Ben Ito", false, buckets)?.detail).toBe(
      "They owe $100.00 and are owed €100.00 in this group. Both have to be settled first.",
    );
  });

  it("never shows a signed amount", () => {
    expect(memberRemovalBlock("Leo Chen", false, [{ currency: "USD", cents: -1250 }])?.detail).not.toContain("-");
  });
});
