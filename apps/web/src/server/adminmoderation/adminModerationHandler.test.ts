/** Transport tests for the moderation handlers: surface, origin, admin session and rate limit, in that order. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Code, type HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { EmptySchema } from "@bufbuild/protobuf/wkt";
import { ReportActionRequestSchema } from "@haalkhata/protogen/adminmoderation/v1/adminmoderation_pb";

vi.mock("@/server/adminanalytics/usecase/adminSession.usecase", () => ({
  requireAdminSession: vi.fn(),
}));
vi.mock("@/server/adminmoderation/usecase/moderation.usecase", () => ({
  listReports: vi.fn(),
  dismissReport: vi.fn(),
  removeReportedContent: vi.fn(),
  suspendAuthor: vi.fn(),
  resumeAuthor: vi.fn(),
}));
vi.mock("@/server/api/connect/context", () => ({
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/common/rateLimit/rateLimit", () => ({ rateLimitCheck: vi.fn() }));

import { requireAdminSession } from "@/server/adminanalytics/usecase/adminSession.usecase";
import * as moderation from "@/server/adminmoderation/usecase/moderation.usecase";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import { adminModerationHandler } from "./handler";

const ADMIN_HOST = "admin.haalkhata.app";
const TOKEN = "T".repeat(43);
const REPORT_ID = "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f";

/**
 * Builds the slice of a Connect handler context the handlers read. Unless a
 * test says otherwise the request carries the admin page's own Origin and
 * an admin cookie.
 *
 * @param requestHeaders - Headers to add or override.
 * @returns The context.
 */
function contextFor(requestHeaders: Record<string, string> = {}): HandlerContext {
  return {
    requestHeader: new Headers({
      host: ADMIN_HOST,
      origin: `https://${ADMIN_HOST}`,
      // The cookie name is fixed when the constants load, outside production.
      cookie: `hk_admin=${TOKEN}`,
      ...requestHeaders,
    }),
    responseHeader: new Headers(),
  } as unknown as HandlerContext;
}

/** Calls every method once with the same context and collects how each ended. */
async function callEveryMethod(context: HandlerContext) {
  const action = create(ReportActionRequestSchema, { reportId: REPORT_ID });
  return Promise.allSettled([
    adminModerationHandler.listReports(create(EmptySchema), context),
    adminModerationHandler.dismissReport(action, context),
    adminModerationHandler.removeReportedContent(action, context),
    adminModerationHandler.suspendAuthor(action, context),
    adminModerationHandler.resumeAuthor(action, context),
  ]);
}

/** Asserts no usecase ran. */
function expectNothingDone(): void {
  expect(moderation.listReports).not.toHaveBeenCalled();
  expect(moderation.dismissReport).not.toHaveBeenCalled();
  expect(moderation.removeReportedContent).not.toHaveBeenCalled();
  expect(moderation.suspendAuthor).not.toHaveBeenCalled();
  expect(moderation.resumeAuthor).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_HOST", ADMIN_HOST);
  vi.mocked(rateLimitCheck).mockReturnValue(true);
  vi.mocked(requireAdminSession).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("moderation handlers", () => {
  it("do not exist on the app's hostname", async () => {
    const results = await callEveryMethod(contextFor({ host: "haalkhata.app", origin: "https://haalkhata.app" }));

    for (const result of results) {
      expect(result).toMatchObject({ status: "rejected", reason: { code: Code.NotFound } });
    }
    expect(requireAdminSession).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("refuse a request the admin page did not start, cookie or not", async () => {
    for (const origin of ["https://haalkhata.app", "", "not a url"]) {
      const results = await callEveryMethod(contextFor({ origin }));
      for (const result of results) {
        expect(result).toMatchObject({ status: "rejected", reason: { code: Code.PermissionDenied } });
      }
    }
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(rateLimitCheck).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("check the admin cookie, and only the admin cookie, before anything else", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("sign in to continue"));
    const results = await callEveryMethod(
      contextFor({ cookie: `hk_token=${TOKEN}`, authorization: `Bearer ${TOKEN}` }),
    );

    for (const result of results) expect(result.status).toBe("rejected");
    expect(requireAdminSession).toHaveBeenCalledTimes(5);
    for (const call of vi.mocked(requireAdminSession).mock.calls) expect(call).toEqual([null]);
    expect(rateLimitCheck).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("are rate-limited once the session is known to be an admin's", async () => {
    vi.mocked(rateLimitCheck).mockReturnValue(false);
    const results = await callEveryMethod(contextFor());

    for (const result of results) {
      expect(result).toMatchObject({ status: "rejected", reason: { code: Code.ResourceExhausted } });
    }
    expect(rateLimitCheck).toHaveBeenCalledWith("admin-moderation-read", 30);
    expect(rateLimitCheck).toHaveBeenCalledWith("admin-moderation-write", 30);
    expectNothingDone();
  });

  it("hand each action the report it names", async () => {
    vi.mocked(moderation.listReports).mockResolvedValue({} as never);
    const results = await callEveryMethod(contextFor());

    for (const result of results) expect(result.status).toBe("fulfilled");
    expect(requireAdminSession).toHaveBeenCalledWith(TOKEN);
    expect(moderation.listReports).toHaveBeenCalledOnce();
    expect(moderation.dismissReport).toHaveBeenCalledExactlyOnceWith(REPORT_ID);
    expect(moderation.removeReportedContent).toHaveBeenCalledExactlyOnceWith(REPORT_ID);
    expect(moderation.suspendAuthor).toHaveBeenCalledExactlyOnceWith(REPORT_ID);
    expect(moderation.resumeAuthor).toHaveBeenCalledExactlyOnceWith(REPORT_ID);
  });
});
