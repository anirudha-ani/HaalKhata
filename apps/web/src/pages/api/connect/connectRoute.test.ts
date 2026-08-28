/** Route-level tests for recoverable Connect startup migration failures. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const { ensureMigratedMock, handlerMock, csrfGuardMock, logErrorMock } = vi.hoisted(() => ({
  ensureMigratedMock: vi.fn(),
  handlerMock: vi.fn(),
  csrfGuardMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@connectrpc/connect-next", () => ({
  nextJsApiRouter: vi.fn(() => ({ handler: handlerMock })),
}));
vi.mock("@/server/api/connect/routes", () => ({ default: vi.fn() }));
vi.mock("@/server/api/connect/csrf", () => ({ csrfGuard: csrfGuardMock }));
vi.mock("@/server/common/db", () => ({ ensureMigrated: ensureMigratedMock }));
vi.mock("@/server/common/logger", () => ({ logError: logErrorMock }));

import connectHandler from "./[[...connect]]";

/** Builds the response methods used by the route wrapper. */
function responseStub(): NextApiResponse {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfGuardMock.mockReturnValue(true);
});

describe("Connect route migration wait", () => {
  it("returns 503 for one failed migration and retries on the next request", async () => {
    ensureMigratedMock
      .mockRejectedValueOnce(new Error("database starting"))
      .mockResolvedValueOnce(undefined);
    const request = {} as NextApiRequest;
    const firstResponse = responseStub();
    const secondResponse = responseStub();

    await connectHandler(request, firstResponse);
    expect(firstResponse.status).toHaveBeenCalledWith(503);
    expect(firstResponse.json).toHaveBeenCalledWith({ error: "service temporarily unavailable" });
    expect(handlerMock).not.toHaveBeenCalled();

    await connectHandler(request, secondResponse);
    expect(ensureMigratedMock).toHaveBeenCalledTimes(2);
    expect(handlerMock).toHaveBeenCalledWith(request, secondResponse);
  });
});
