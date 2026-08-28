/** Error-boundary tests for safe Connect responses and server-side diagnostics. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Code, ConnectError } from "@connectrpc/connect";

vi.mock("@/server/common/logger", () => ({ logError: vi.fn() }));

import { UsecaseError } from "@/server/common/errors";
import { logError } from "@/server/common/logger";
import { runUsecase } from "./context";

beforeEach(() => vi.clearAllMocks());

describe("runUsecase error boundary", () => {
  it("preserves explicitly safe usecase errors", async () => {
    await expect(
      runUsecase(() => {
        throw new UsecaseError("invalid_argument", "safe validation message");
      }),
    ).rejects.toMatchObject({ code: Code.InvalidArgument, rawMessage: "safe validation message" });
  });

  it("preserves existing Connect authentication errors", async () => {
    const expected = new ConnectError("sign in to continue", Code.Unauthenticated);

    await expect(
      runUsecase(() => {
        throw expected;
      }),
    ).rejects.toBe(expected);
  });

  it("logs unexpected details but returns only a correlated generic error", async () => {
    const leakedMessage = 'duplicate key violates unique constraint "users_email_key"';

    const rejected = runUsecase(() => {
      throw new Error(leakedMessage);
    });

    await expect(rejected).rejects.toMatchObject({ code: Code.Internal });
    await expect(rejected).rejects.not.toMatchObject({ rawMessage: expect.stringContaining(leakedMessage) });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: leakedMessage }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
