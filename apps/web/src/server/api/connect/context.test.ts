/** Tests for the Connect error boundary and the sliding session renewal in requireUser. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { SESSION_RENEWAL_HEADER } from "@haalkhata/shared/auth/sessionRenewal";

// Set the signing secret before the auth module reads it, so tests don't
// touch the filesystem (the dev fallback writes data/.secret).
process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";

vi.mock("@/server/common/logger", () => ({ logError: vi.fn() }));
vi.mock("@/server/auth/repo/sessions.repo", () => ({
  findSessionStanding: vi.fn(),
  insertSession: vi.fn(),
  touchSession: vi.fn(),
}));

import { UsecaseError } from "@/server/common/errors";
import { logError } from "@/server/common/logger";
import { findSessionStanding } from "@/server/auth/repo/sessions.repo";
import { TOKEN_LIFETIME_SECONDS } from "@/server/auth/auth.constants";
import { createToken, tokenExpiresAt, verifyToken } from "@/server/auth/usecase/session/session";
import { SESSION_COOKIE } from "./connect.constants";
import { requireUser, runUsecase } from "./context";

beforeEach(() => vi.clearAllMocks());

/**
 * Builds the slice of a Connect handler context requireUser touches.
 *
 * @param headers - Request headers for the call.
 * @param methodName - RPC name, since sign-out is exempt from renewal.
 * @returns A minimal handler context with an empty response header bag.
 */
function contextWith(headers: Record<string, string>, methodName = "GetMe"): HandlerContext {
  return {
    method: { name: methodName },
    requestHeader: new Headers(headers),
    responseHeader: new Headers(),
  } as unknown as HandlerContext;
}

describe("requireUser session renewal", () => {
  afterEach(() => vi.useRealTimers());

  /**
   * Issues a token at one moment and advances the clock by a number of days.
   *
   * @param daysUsed - How many days ago it was issued.
   * @returns The token as the client would still be presenting it.
   */
  function agedToken(daysUsed: number): string {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const token = createToken("user-1", 3, "session-1");
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 1 + daysUsed)));
    vi.mocked(findSessionStanding).mockResolvedValue({
      token_version: 3,
      legacy_sessions_ended: false,
      session_found: true,
      session_ended: false,
    });
    return token;
  }

  it("re-issues an aging bearer session in a response header", async () => {
    const token = agedToken(4);
    const context = contextWith({ authorization: `Bearer ${token}` });

    await expect(requireUser(context)).resolves.toBe("user-1");

    const renewed = context.responseHeader.get(SESSION_RENEWAL_HEADER);
    expect(renewed).not.toBeNull();
    expect(renewed).not.toBe(token);
    expect(verifyToken(renewed!)).toBe("user-1");
    expect(context.responseHeader.get("set-cookie")).toBeNull();
  });

  it("re-issues an aging cookie session as a fresh cookie", async () => {
    const token = agedToken(4);
    const context = contextWith({ cookie: `${SESSION_COOKIE}=${token}` });

    await requireUser(context);

    const setCookie = context.responseHeader.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=v3.user-1.3.session-1.`);
    expect(setCookie).not.toContain(token);
    expect(context.responseHeader.get(SESSION_RENEWAL_HEADER)).toBeNull();
  });

  it("leaves a young session alone", async () => {
    const token = agedToken(1);
    const context = contextWith({ authorization: `Bearer ${token}` });

    await requireUser(context);

    expect(context.responseHeader.get(SESSION_RENEWAL_HEADER)).toBeNull();
    expect(context.responseHeader.get("set-cookie")).toBeNull();
  });

  it("gives somebody back the whole lifetime the next time they open the app, even months later", async () => {
    const context = contextWith({ authorization: `Bearer ${agedToken(300)}` });

    await requireUser(context);

    const renewed = context.responseHeader.get(SESSION_RENEWAL_HEADER)!;
    expect(tokenExpiresAt(renewed) - Date.now() / 1000).toBe(TOKEN_LIFETIME_SECONDS);
  });

  it("moves a session from the old seven-day life onto the new one at once", async () => {
    // A token with six days left is what somebody signed in before this change holds.
    const context = contextWith({ authorization: `Bearer ${agedToken(394)}` });

    await requireUser(context);

    expect(context.responseHeader.get(SESSION_RENEWAL_HEADER)).not.toBeNull();
  });

  it("does not renew a session again the same day", async () => {
    const context = contextWith({ authorization: `Bearer ${agedToken(0)}` });

    await requireUser(context);

    expect(context.responseHeader.get(SESSION_RENEWAL_HEADER)).toBeNull();
  });

  it("never renews on the way out of LogOut", async () => {
    const token = agedToken(4);
    const context = contextWith({ authorization: `Bearer ${token}` }, "LogOut");

    await requireUser(context);

    expect(context.responseHeader.get(SESSION_RENEWAL_HEADER)).toBeNull();
  });
});

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
