/** Route-level tests for the production readiness endpoint. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const { ensureMigratedMock, logErrorMock, queryMock, signPayloadMock, authConfig } = vi.hoisted(
  () => ({
    ensureMigratedMock: vi.fn(),
    logErrorMock: vi.fn(),
    queryMock: vi.fn(),
    signPayloadMock: vi.fn(),
    /** Mutable sign-in configuration the constants mock reads through. */
    authConfig: { passwordAuth: true, clientId: "", audiences: [] as string[] },
  }),
);

vi.mock("@/server/auth/usecase/auth.usecase", () => ({ signPayload: signPayloadMock }));
vi.mock("@/server/auth/auth.constants", () => ({
  passwordAuthEnabled: () => authConfig.passwordAuth,
  get GOOGLE_CLIENT_ID() {
    return authConfig.clientId;
  },
  get GOOGLE_AUDIENCES() {
    return authConfig.audiences;
  },
}));
vi.mock("@/server/common/db", () => ({
  ensureMigrated: ensureMigratedMock,
  query: queryMock,
}));
vi.mock("@/server/common/logger", () => ({ logError: logErrorMock }));

import healthHandler from "@/pages/api/health";

/** Builds the response methods exercised by the readiness handler. */
function responseStub(): NextApiResponse {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  signPayloadMock.mockReturnValue("signature");
  ensureMigratedMock.mockResolvedValue(undefined);
  queryMock.mockResolvedValue([{ one: 1 }]);
  authConfig.passwordAuth = true;
  authConfig.clientId = "";
  authConfig.audiences = [];
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
});

/** Puts the server in production's Google-only posture with a working configuration. */
function googleOnly(): void {
  authConfig.passwordAuth = false;
  authConfig.clientId = "web-client-id";
  authConfig.audiences = ["web-client-id"];
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "web-client-id";
}

describe("readiness endpoint", () => {
  it("reports ready only after every security and database check succeeds", async () => {
    const response = responseStub();

    await healthHandler({ method: "HEAD" } as NextApiRequest, response);

    expect(signPayloadMock).toHaveBeenCalledWith("session", "healthcheck");
    expect(ensureMigratedMock).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ status: "ok" });
  });

  it.each([
    ["signing secret", signPayloadMock],
    ["migration", ensureMigratedMock],
    ["database query", queryMock],
  ])("returns one generic 503 when the %s check fails", async (_label, failingCheck) => {
    failingCheck.mockRejectedValueOnce(new Error("sensitive failure detail"));
    if (failingCheck === signPayloadMock) {
      failingCheck.mockReset();
      failingCheck.mockImplementationOnce(() => {
        throw new Error("sensitive failure detail");
      });
    }
    const response = responseStub();

    await healthHandler({ method: "GET" } as NextApiRequest, response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ status: "unavailable" });
    expect(logErrorMock).toHaveBeenCalledOnce();
  });

  it("is ready under a consistent Google-only configuration", async () => {
    googleOnly();
    const response = responseStub();
    await healthHandler({ method: "GET" } as NextApiRequest, response);
    expect(response.status).toHaveBeenCalledWith(200);
  });

  // M-06: production signs in with Google only. A stack that starts without
  // a client id, or whose bundle was built for a different id than the
  // server accepts, used to pass readiness while every signed-out user was
  // locked out.
  it.each([
    [
      "no Google client id at runtime",
      () => {
        authConfig.clientId = "";
        authConfig.audiences = [];
      },
    ],
    ["an image built without the public client id", () => delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID],
    [
      "a bundle built for a different client id than the server accepts",
      () => {
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "some-other-id";
      },
    ],
  ])("refuses readiness with %s", async (_label, misconfigure) => {
    googleOnly();
    misconfigure();
    const response = responseStub();
    await healthHandler({ method: "GET" } as NextApiRequest, response);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ status: "unavailable" });
    expect(logErrorMock).toHaveBeenCalledOnce();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects methods that are not readiness probes", async () => {
    const response = responseStub();

    await healthHandler({ method: "POST" } as NextApiRequest, response);

    expect(response.status).toHaveBeenCalledWith(405);
    expect(signPayloadMock).not.toHaveBeenCalled();
    expect(ensureMigratedMock).not.toHaveBeenCalled();
  });
});
