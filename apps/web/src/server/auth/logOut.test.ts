/**
 * Signing out only clears the cookie once the session is really over: a failure
 * that leaves it live must keep the cookie, because the retry needs it to say
 * which session to end.
 */

import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(),
  endCurrentSession: vi.fn(),
  requireUser: vi.fn(async () => "user-sara"),
}));

vi.mock("@/server/api/connect/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/api/connect/context")>()),
  clearSessionCookie: session.clearSessionCookie,
  requireUser: session.requireUser,
  currentSessionId: () => "session-1",
  runUsecase: async <Result>(work: () => Promise<Result>) => work(),
}));
vi.mock("@/server/auth/usecase/session/sessions.usecase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/usecase/session/sessions.usecase")>()),
  endCurrentSession: session.endCurrentSession,
}));

import { authHandler } from "./handler";

/** @returns What LogOut did. */
const logOut = () => authHandler.logOut!({} as never, {} as never);

beforeEach(() => {
  vi.clearAllMocks();
  session.requireUser.mockResolvedValue("user-sara");
  session.endCurrentSession.mockResolvedValue(undefined);
});

describe("LogOut", () => {
  it("clears the cookie once the session has ended", async () => {
    await logOut();
    expect(session.clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("takes a dead cookie with it when the session is already over", async () => {
    session.requireUser.mockRejectedValue(new ConnectError("session ended", Code.Unauthenticated));
    await expect(logOut()).rejects.toMatchObject({ code: Code.Unauthenticated });
    expect(session.clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("keeps the cookie when the session could not be ended, so the retry can end it", async () => {
    session.endCurrentSession.mockRejectedValue(new ConnectError("internal server error", Code.Internal));
    await expect(logOut()).rejects.toMatchObject({ code: Code.Internal });
    expect(session.clearSessionCookie).not.toHaveBeenCalled();
  });
});
