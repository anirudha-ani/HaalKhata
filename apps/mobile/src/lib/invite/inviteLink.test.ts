/** A link minted on a server points at that server, whichever one this build talks to. */

import { describe, expect, it, vi } from "vitest";
import { shareableInviteUrl } from "./inviteLink";

vi.mock("@/lib/api/api.constants", () => ({ resolveApiBaseUrl: () => "https://khata.example.com/api/connect" }));

describe("shareableInviteUrl", () => {
  it("uses the server's address, without the path of its API", () => {
    expect(shareableInviteUrl("token-1")).toBe("https://khata.example.com/join/token-1");
  });
});
