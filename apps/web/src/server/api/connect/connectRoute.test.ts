/** Route-level tests for the Connect mount: the surface gate and recoverable startup migration failures. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/server/common/db/db", () => ({ ensureMigrated: ensureMigratedMock }));
vi.mock("@/server/common/logger", () => ({ logError: logErrorMock }));

import connectHandler from "@/pages/api/connect/[[...connect]]";

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

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Builds a request for an RPC path on a hostname.
 *
 * @param host - The Host header.
 * @param requestPath - The request path.
 * @returns The request.
 */
function rpcRequest(host: string, requestPath: string): NextApiRequest {
  return {
    url: requestPath,
    headers: { host, cookie: "session=1" },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("Connect route surface gate", () => {
  const ADMIN_RPC = "/api/connect/adminanalytics.v1.AdminAnalyticsService/GetUsageOverview";
  const APP_RPC = "/api/connect/expense.v1.ExpenseService/ListExpenses";

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_HOST", "admin.haalkhata.app");
    ensureMigratedMock.mockResolvedValue(undefined);
  });

  it("answers 404 for the admin service on the app's hostname, before anything else runs", async () => {
    const response = responseStub();

    await connectHandler(rpcRequest("haalkhata.app", ADMIN_RPC), response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(csrfGuardMock).not.toHaveBeenCalled();
    expect(ensureMigratedMock).not.toHaveBeenCalled();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("answers 404 for every app service on the admin hostname", async () => {
    const response = responseStub();

    await connectHandler(rpcRequest("admin.haalkhata.app", APP_RPC), response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("serves each service on its own hostname", async () => {
    const adminRequest = rpcRequest("admin.haalkhata.app", ADMIN_RPC);
    const appRequest = rpcRequest("haalkhata.app", APP_RPC);

    await connectHandler(adminRequest, responseStub());
    await connectHandler(appRequest, responseStub());

    expect(handlerMock).toHaveBeenCalledTimes(2);
    expect(handlerMock.mock.calls[0][0]).toBe(adminRequest);
    expect(handlerMock.mock.calls[1][0]).toBe(appRequest);
  });
});

describe("Connect route migration wait", () => {
  it("returns 503 for one failed migration and retries on the next request", async () => {
    ensureMigratedMock
      .mockRejectedValueOnce(new Error("database starting"))
      .mockResolvedValueOnce(undefined);
    const request = {
      headers: { "x-haalkhata-peer-ip": "attacker-value" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as NextApiRequest;
    const firstResponse = responseStub();
    const secondResponse = responseStub();

    await connectHandler(request, firstResponse);
    expect(firstResponse.status).toHaveBeenCalledWith(503);
    expect(firstResponse.json).toHaveBeenCalledWith({ error: "service temporarily unavailable" });
    expect(handlerMock).not.toHaveBeenCalled();

    await connectHandler(request, secondResponse);
    expect(ensureMigratedMock).toHaveBeenCalledTimes(2);
    expect(handlerMock).toHaveBeenCalledWith(request, secondResponse);
    expect(request.headers["x-haalkhata-peer-ip"]).toBe("127.0.0.1");
  });
});
