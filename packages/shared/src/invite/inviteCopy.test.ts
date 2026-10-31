/** Invite text must distinguish joining a group from requesting friendship, and never promise a claim. */

import { describe, expect, it } from "vitest";
import { GROUP_INVITE_LINK_LIFETIME_DAYS } from "./invite.constants";
import {
  groupInviteExplainer,
  inviteCopy,
  INVITE_EXPIRED_BODY,
  INVITE_EXPIRED_TITLE,
  NOT_ON_HAALKHATA_COPY,
  type InvitePreview,
} from "./inviteCopy";

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

describe("how long a group link works", () => {
  it("tells whoever shares it until when, in a short date", () => {
    const explainer = groupInviteExplainer("Bali Trip", "2026-11-04T10:00:00.000Z", new Date("2026-10-28T10:00:00.000Z"));

    expect(explainer).toMatch(/^Anyone who scans this or opens the link can join Bali Trip until Nov [34]\./);
    expect(explainer).toContain("They'll see who invited them before accepting.");
  });

  it("adds the year only when it is not this one", () => {
    expect(groupInviteExplainer("Trip", "2027-01-03T10:00:00.000Z", new Date("2026-12-30T10:00:00.000Z"))).toMatch(/2027/);
  });

  it("leaves the date out when the server sent none", () => {
    expect(groupInviteExplainer("Trip", "")).toBe(
      "Anyone who scans this or opens the link can join Trip. They'll see who invited them before accepting.",
    );
  });

  it("says on the join page that it expired, after how long, and what to do", () => {
    expect(INVITE_EXPIRED_TITLE).toBe("This invite link has expired");
    expect(INVITE_EXPIRED_BODY).toContain(`${GROUP_INVITE_LINK_LIFETIME_DAYS} days`);
    expect(INVITE_EXPIRED_BODY).toContain("Ask someone in the group to share a new one.");
  });
});
