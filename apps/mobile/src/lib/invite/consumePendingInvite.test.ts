/** Signing in resumes an invite without accepting silently or swallowing its result. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { takePendingInvite } from "./pendingInvite";
import { consumePendingInvite } from "./consumePendingInvite";

vi.mock("./pendingInvite", () => ({ takePendingInvite: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe("resuming a signed-out invite", () => {
  it("returns to the preview so the person can accept and see any error or pending friend request", async () => {
    vi.mocked(takePendingInvite).mockResolvedValue("invite-token");
    expect(await consumePendingInvite()).toBe("/join/invite-token");
  });
  it("opens Home after an ordinary login", async () => {
    vi.mocked(takePendingInvite).mockResolvedValue(null);
    expect(await consumePendingInvite()).toBe("/dashboard");
  });
  it("keeps an unexpected token in a single route segment", async () => {
    vi.mocked(takePendingInvite).mockResolvedValue("token/with?query");
    expect(await consumePendingInvite()).toBe("/join/token%2Fwith%3Fquery");
  });
});
