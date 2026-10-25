/** Transport tests for the admin handlers: the surface check, the cookie-only credential, and the cookie they set. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Code, type HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { EmptySchema } from "@bufbuild/protobuf/wkt";
import {
  GetUsageTrendRequestSchema,
  SignInRequestSchema,
  TrendUnit,
} from "@haalkhata/protogen/adminanalytics/v1/adminanalytics_pb";

vi.mock("@/server/adminanalytics/usecase/adminSession.usecase", () => ({
  beginAdminSignIn: vi.fn(),
  requireAdminSession: vi.fn(),
  signInAdmin: vi.fn(),
  signOutAdmin: vi.fn(),
}));
vi.mock("@/server/adminanalytics/usecase/usage.usecase", () => ({ getUsageOverview: vi.fn() }));
vi.mock("@/server/adminanalytics/usecase/usageTrend.usecase", () => ({ getUsageTrend: vi.fn() }));
vi.mock("@/server/api/connect/context", () => ({
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
}));
vi.mock("@/server/common/rateLimit/rateLimit", () => ({ rateLimitCheck: vi.fn() }));

import {
  beginAdminSignIn,
  requireAdminSession,
  signInAdmin,
  signOutAdmin,
} from "@/server/adminanalytics/usecase/adminSession.usecase";
import { getUsageOverview } from "@/server/adminanalytics/usecase/usage.usecase";
import { getUsageTrend } from "@/server/adminanalytics/usecase/usageTrend.usecase";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import { adminAnalyticsHandler } from "./handler";

const ADMIN_HOST = "admin.haalkhata.app";
const ADMIN_ORIGIN = `https://${ADMIN_HOST}`;
const TOKEN = "T".repeat(43);

/**
 * Builds the slice of a Connect handler context the admin handlers read.
 * Unless a test says otherwise the request carries the admin page's own
 * Origin, as every request the page makes does.
 *
 * @param requestHeaders - Request headers, including Host and Cookie.
 * @returns The context and the response headers it collects.
 */
function contextFor(requestHeaders: Record<string, string>): {
  context: HandlerContext;
  responseHeader: Headers;
} {
  const responseHeader = new Headers();
  return {
    context: {
      requestHeader: new Headers({ origin: ADMIN_ORIGIN, ...requestHeaders }),
      responseHeader,
    } as unknown as HandlerContext,
    responseHeader,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_HOST", ADMIN_HOST);
  vi.mocked(rateLimitCheck).mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin handlers on the app's hostname", () => {
  it("do not exist: every method answers not found before doing anything", async () => {
    const { context } = contextFor({ host: "haalkhata.app", cookie: `__Host-hk_admin=${TOKEN}` });
    const empty = create(EmptySchema);

    await expect(adminAnalyticsHandler.beginSignIn(empty, context)).rejects.toMatchObject({
      code: Code.NotFound,
    });
    await expect(
      adminAnalyticsHandler.signIn(create(SignInRequestSchema, { idToken: "token" }), context),
    ).rejects.toMatchObject({ code: Code.NotFound });
    await expect(adminAnalyticsHandler.signOut(empty, context)).rejects.toMatchObject({
      code: Code.NotFound,
    });
    await expect(adminAnalyticsHandler.getUsageOverview(empty, context)).rejects.toMatchObject({
      code: Code.NotFound,
    });

    expect(beginAdminSignIn).not.toHaveBeenCalled();
    expect(signInAdmin).not.toHaveBeenCalled();
    expect(signOutAdmin).not.toHaveBeenCalled();
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(getUsageOverview).not.toHaveBeenCalled();
  });
});

describe("admin handlers and requests the admin page did not start", () => {
  const empty = create(EmptySchema);

  /**
   * Calls every method with the given headers and collects how each ended.
   *
   * @param requestHeaders - Request headers for all four calls.
   * @returns The Connect code each method was refused with.
   */
  async function refusalCodes(requestHeaders: Record<string, string>): Promise<unknown[]> {
    const { context } = contextFor(requestHeaders);
    const calls = [
      async () => adminAnalyticsHandler.beginSignIn(empty, context),
      async () =>
        adminAnalyticsHandler.signIn(create(SignInRequestSchema, { idToken: "token" }), context),
      async () => adminAnalyticsHandler.signOut(empty, context),
      async () => adminAnalyticsHandler.getUsageOverview(empty, context),
    ];
    const codes: unknown[] = [];
    for (const call of calls) {
      try {
        await call();
        codes.push("served");
      } catch (error) {
        codes.push((error as { code?: unknown }).code);
      }
    }
    return codes;
  }

  it("refuse the app's own origin, although it is the same site and the cookie comes along", async () => {
    const codes = await refusalCodes({
      host: ADMIN_HOST,
      origin: "https://haalkhata.app",
      cookie: `hk_admin=${TOKEN}`,
    });

    expect(codes).toEqual(Array(4).fill(Code.PermissionDenied));
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(getUsageOverview).not.toHaveBeenCalled();
    expect(signOutAdmin).not.toHaveBeenCalled();
    expect(signInAdmin).not.toHaveBeenCalled();
  });

  it("are not talked round by a bearer header, which exempts a request from the app's own guard", async () => {
    const codes = await refusalCodes({
      host: ADMIN_HOST,
      origin: "https://haalkhata.app",
      authorization: `Bearer ${TOKEN}`,
      cookie: `hk_admin=${TOKEN}`,
    });

    expect(codes).toEqual(Array(4).fill(Code.PermissionDenied));
    expect(getUsageOverview).not.toHaveBeenCalled();
  });

  it("refuse a request with no Origin, a malformed one, or a lookalike host", async () => {
    for (const origin of ["", "not a url", "https://admin.haalkhata.app.evil.example", "null"]) {
      const codes = await refusalCodes({ host: ADMIN_HOST, origin, cookie: `hk_admin=${TOKEN}` });
      expect(codes).toEqual(Array(4).fill(Code.PermissionDenied));
    }
    expect(getUsageOverview).not.toHaveBeenCalled();
  });

  it("do not spend a sign-in attempt on a request they refuse", async () => {
    await refusalCodes({ host: ADMIN_HOST, origin: "https://haalkhata.app" });

    expect(rateLimitCheck).not.toHaveBeenCalled();
  });
});

describe("admin sign-in", () => {
  it("sets a host-only, HttpOnly, Strict cookie and returns nothing readable", async () => {
    vi.mocked(signInAdmin).mockResolvedValue({ token: TOKEN });
    const { context, responseHeader } = contextFor({ host: ADMIN_HOST });

    const response = await adminAnalyticsHandler.signIn(
      create(SignInRequestSchema, { idToken: "google-token" }),
      context,
    );

    expect(response).toEqual({});
    // The cookie name is fixed when the module loads, under the test
    // environment; the attributes are what this asserts.
    const cookie = responseHeader.get("set-cookie") ?? "";
    expect(cookie).toContain(`hk_admin=${TOKEN};`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Domain=");
  });

  it("sets no cookie when the sign-in is refused", async () => {
    vi.mocked(signInAdmin).mockRejectedValue(new Error("this Google account does not have admin access"));
    const { context, responseHeader } = contextFor({ host: ADMIN_HOST });

    await expect(
      adminAnalyticsHandler.signIn(create(SignInRequestSchema, { idToken: "token" }), context),
    ).rejects.toThrow();
    expect(responseHeader.get("set-cookie")).toBeNull();
  });

  it("is rate-limited per client address before Google is consulted", async () => {
    vi.mocked(rateLimitCheck).mockReturnValue(false);
    const { context } = contextFor({ host: ADMIN_HOST, "x-haalkhata-peer-ip": "203.0.113.9" });

    await expect(
      adminAnalyticsHandler.signIn(create(SignInRequestSchema, { idToken: "token" }), context),
    ).rejects.toMatchObject({ code: Code.ResourceExhausted });
    await expect(
      adminAnalyticsHandler.beginSignIn(create(EmptySchema), context),
    ).rejects.toMatchObject({ code: Code.ResourceExhausted });

    expect(rateLimitCheck).toHaveBeenCalledWith("admin-auth:203.0.113.9", 5);
    expect(signInAdmin).not.toHaveBeenCalled();
    expect(beginAdminSignIn).not.toHaveBeenCalled();
  });

  it("counts nonces apart from exchanges, so a refused sign-in does not spend the exchange budget twice", async () => {
    vi.mocked(beginAdminSignIn).mockResolvedValue({ nonce: "nonce" });
    const { context } = contextFor({ host: ADMIN_HOST, "x-haalkhata-peer-ip": "203.0.113.9" });

    await adminAnalyticsHandler.beginSignIn(create(EmptySchema), context);

    expect(rateLimitCheck).toHaveBeenCalledExactlyOnceWith("admin-nonce:203.0.113.9", 30);
  });
});

describe("admin usage overview", () => {
  it("checks the session from the admin cookie before reading anything", async () => {
    vi.mocked(getUsageOverview).mockResolvedValue({} as never);
    const { context } = contextFor({ host: ADMIN_HOST, cookie: `hk_admin=${TOKEN}; other=1` });

    await adminAnalyticsHandler.getUsageOverview(create(EmptySchema), context);

    expect(requireAdminSession).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(getUsageOverview).toHaveBeenCalledOnce();
  });

  it("returns nothing when the session is refused", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("sign in to continue"));
    const { context } = contextFor({ host: ADMIN_HOST });

    await expect(
      adminAnalyticsHandler.getUsageOverview(create(EmptySchema), context),
    ).rejects.toThrow("sign in to continue");
    expect(getUsageOverview).not.toHaveBeenCalled();
  });

  it("never treats a bearer token or the app's session cookie as an admin credential", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("sign in to continue"));
    const { context } = contextFor({
      host: ADMIN_HOST,
      authorization: `Bearer ${TOKEN}`,
      cookie: `hk_token=${TOKEN}`,
    });

    await expect(
      adminAnalyticsHandler.getUsageOverview(create(EmptySchema), context),
    ).rejects.toThrow();
    expect(requireAdminSession).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("refuses a request carrying two admin cookies rather than picking one", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(new Error("sign in to continue"));
    const { context } = contextFor({
      host: ADMIN_HOST,
      cookie: `hk_admin=${TOKEN}; hk_admin=${"U".repeat(43)}`,
    });

    await expect(
      adminAnalyticsHandler.getUsageOverview(create(EmptySchema), context),
    ).rejects.toThrow();
    expect(requireAdminSession).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("is rate-limited once the session is known to be an admin's", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(undefined);
    vi.mocked(rateLimitCheck).mockReturnValue(false);
    const { context } = contextFor({ host: ADMIN_HOST, cookie: `hk_admin=${TOKEN}` });

    await expect(
      adminAnalyticsHandler.getUsageOverview(create(EmptySchema), context),
    ).rejects.toMatchObject({ code: Code.ResourceExhausted });
    expect(getUsageOverview).not.toHaveBeenCalled();
  });
});

describe("admin usage trend", () => {
  const request = create(GetUsageTrendRequestSchema, { unit: TrendUnit.MONTH, endOn: "2025-06-30" });

  it("does not exist on the app's hostname, and refuses another origin", async () => {
    await expect(
      adminAnalyticsHandler.getUsageTrend(request, contextFor({ host: "haalkhata.app" }).context),
    ).rejects.toMatchObject({ code: Code.NotFound });
    await expect(
      adminAnalyticsHandler.getUsageTrend(
        request,
        contextFor({ host: ADMIN_HOST, origin: "https://haalkhata.app" }).context,
      ),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(getUsageTrend).not.toHaveBeenCalled();
  });

  it("checks the session, then its own rate limit, then reads the window asked for", async () => {
    vi.mocked(getUsageTrend).mockResolvedValue({} as never);
    const { context } = contextFor({ host: ADMIN_HOST, cookie: `hk_admin=${TOKEN}` });

    await adminAnalyticsHandler.getUsageTrend(request, context);

    expect(requireAdminSession).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(rateLimitCheck).toHaveBeenCalledWith("admin-usage-trend", 60);
    expect(getUsageTrend).toHaveBeenCalledExactlyOnceWith({ unit: TrendUnit.MONTH, endOn: "2025-06-30" });
  });

  it("reads nothing without a session or past the rate limit", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new Error("sign in to continue"));
    const { context } = contextFor({ host: ADMIN_HOST });
    await expect(adminAnalyticsHandler.getUsageTrend(request, context)).rejects.toThrow();

    vi.mocked(rateLimitCheck).mockReturnValue(false);
    await expect(adminAnalyticsHandler.getUsageTrend(request, context)).rejects.toMatchObject({
      code: Code.ResourceExhausted,
    });
    expect(getUsageTrend).not.toHaveBeenCalled();
  });
});

describe("admin sign-out", () => {
  it("ends the session on the server and expires the cookie", async () => {
    const { context, responseHeader } = contextFor({ host: ADMIN_HOST, cookie: `hk_admin=${TOKEN}` });

    await adminAnalyticsHandler.signOut(create(EmptySchema), context);

    expect(signOutAdmin).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(responseHeader.get("set-cookie")).toContain("hk_admin=;");
    expect(responseHeader.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps the cookie when the server could not end the session, so sign-out can be retried", async () => {
    vi.mocked(signOutAdmin).mockRejectedValue(new Error("database unavailable"));
    const { context, responseHeader } = contextFor({ host: ADMIN_HOST, cookie: `hk_admin=${TOKEN}` });

    await expect(adminAnalyticsHandler.signOut(create(EmptySchema), context)).rejects.toThrow();
    // Expiring it here would strand a session that is still valid on the server.
    expect(responseHeader.get("set-cookie")).toBeNull();
  });
});
