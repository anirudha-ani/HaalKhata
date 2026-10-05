/** Unit tests for the member-action confirmation wording. */

import { describe, expect, it } from "vitest";
import { memberActionPrompt } from "./memberActions";

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
