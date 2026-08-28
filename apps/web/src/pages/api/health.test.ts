/** Route-level tests for the production readiness endpoint. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const { ensureMigratedMock, logErrorMock, queryMock, signPayloadMock } = vi.hoisted(() => ({
  ensureMigratedMock: vi.fn(),
  logErrorMock: vi.fn(),
  queryMock: vi.fn(),
  signPayloadMock: vi.fn(),
}));

vi.mock("@/server/auth/usecase/auth.usecase", () => ({ signPayload: signPayloadMock }));
vi.mock("@/server/common/db", () => ({
  ensureMigrated: ensureMigratedMock,
  query: queryMock,
}));
vi.mock("@/server/common/logger", () => ({ logError: logErrorMock }));

import healthHandler from "./health";

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
});

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

  it("rejects methods that are not readiness probes", async () => {
    const response = responseStub();

    await healthHandler({ method: "POST" } as NextApiRequest, response);

    expect(response.status).toHaveBeenCalledWith(405);
    expect(signPayloadMock).not.toHaveBeenCalled();
    expect(ensureMigratedMock).not.toHaveBeenCalled();
  });
});
