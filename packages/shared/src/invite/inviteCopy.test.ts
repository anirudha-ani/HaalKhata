/** Invite text must distinguish joining a group from requesting friendship, and never promise a claim. */

import { describe, expect, it } from "vitest";
import { inviteCopy, NOT_ON_HAALKHATA_COPY, type InvitePreview } from "./inviteCopy";

const PREVIEW: InvitePreview = { kind: "group", inviterName: "Ari", groupName: "Trip", memberCount: 1 };

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
  it("never offers to take over somebody else's invitation", () => {
    // One-person links are retired; nothing a link opens claims a seat.
    for (const kind of ["group", "profile", "friend"]) {
      const result = inviteCopy({ ...PREVIEW, kind });
      expect(`${result.title} ${result.description} ${result.action}`).not.toMatch(/claim|seat|added you as/i);
    }
  });
  it("offers each add form the link that fits it when nobody has the typed contact", () => {
    expect(NOT_ON_HAALKHATA_COPY.friend.action).toBe("Share your invite link");
    expect(NOT_ON_HAALKHATA_COPY.group.message).toContain("join the group");
  });
});
