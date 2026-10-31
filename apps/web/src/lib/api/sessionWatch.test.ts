/** A refused session ends the app wherever it is noticed, and nothing else does. */

import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noticeSessionEnded } from "@/lib/auth/signOut";
import { sessionWatch } from "./sessionWatch";

vi.mock("@/lib/auth/signOut", () => ({ noticeSessionEnded: vi.fn() }));

/**
 * Runs a call that fails.
 *
 * @param failure - What it fails with.
 * @returns What the caller sees.
 */
const failingCall = (failure: unknown) =>
  sessionWatch(() => Promise.reject(failure))({} as never);

beforeEach(() => vi.mocked(noticeSessionEnded).mockClear());

describe("sessionWatch", () => {
  it("hands on a refused session and still fails the call", async () => {
    const refused = new ConnectError("expired", Code.Unauthenticated);

    await expect(failingCall(refused)).rejects.toBe(refused);

    expect(noticeSessionEnded).toHaveBeenCalledOnce();
  });

  it("does not treat any other failure as the end of a session", async () => {
    await expect(failingCall(new ConnectError("offline", Code.Unavailable))).rejects.toThrow();
    await expect(failingCall(new Error("network"))).rejects.toThrow();

    expect(noticeSessionEnded).not.toHaveBeenCalled();
  });
});
