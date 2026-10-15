/** Invite text must distinguish joining, claiming an invitation and requesting friendship. */

import { describe, expect, it } from "vitest";
import { inviteCopy, type InvitePreview } from "./inviteCopy";

const PREVIEW: InvitePreview = { kind: "group", inviterName: "Ari", groupName: "Trip", memberCount: 1, invitedName: "Sam" };

describe("invite explanations", () => {
  it("names the group and handles singular and plural membership", () => {
    expect(inviteCopy(PREVIEW)).toMatchObject({ title: "Ari invited you to “Trip”", action: "Join the group" });
    expect(inviteCopy(PREVIEW).description).toContain("1 member.");
    expect(inviteCopy({ ...PREVIEW, memberCount: 3 }).description).toContain("3 members.");
  });
  it("does not promise an immediate friendship when a profile link only sends a request", () => {
    expect(inviteCopy({ ...PREVIEW, kind: "profile" })).toMatchObject({
      action: "Send friend request",
      description: "Accepting sends them a friend request; you'll be connected once they confirm.",
      requestSent: "Request sent — Ari will confirm from their side.",
    });
  });
  it("explains that accepting a named invite claims existing group seats", () => {
    const result = inviteCopy({ ...PREVIEW, kind: "person" });
    expect(result.action).toBe("Accept the invite");
    expect(result.description).toContain("“Sam”");
    expect(result.description).toContain("group seats");
  });
});
