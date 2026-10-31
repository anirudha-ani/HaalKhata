/** @vitest-environment jsdom */
/** A link minted here points here, not at another instance. */

import { describe, expect, it } from "vitest";
import { shareableInviteUrl } from "./inviteLink";

describe("shareableInviteUrl", () => {
  it("uses the address this page was opened at", () => {
    expect(shareableInviteUrl("token-1")).toBe(`${window.location.origin}/join/token-1`);
  });
});
