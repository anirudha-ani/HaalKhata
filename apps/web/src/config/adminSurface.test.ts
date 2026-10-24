/** Tests for surface routing: which hostname reaches the admin page, its API, and nothing else. */

import { describe, expect, it } from "vitest";
import { pageVerdict, requestSurface, rpcAllowedOnSurface } from "./adminSurface";

const PRODUCTION = { NODE_ENV: "production", ADMIN_HOST: "admin.haalkhata.app" };
const PRODUCTION_WITHOUT_ADMIN = { NODE_ENV: "production" };
const DEVELOPMENT = { NODE_ENV: "development" };

const ADMIN_RPC = "/api/connect/adminanalytics.v1.AdminAnalyticsService/GetUsageOverview";
const MODERATION_RPC = "/api/connect/adminmoderation.v1.AdminModerationService/RemoveReportedContent";
const APP_RPC = "/api/connect/expense.v1.ExpenseService/ListExpenses";

describe("requestSurface", () => {
  it("names the configured hostname the admin surface and everything else the app", () => {
    expect(requestSurface("admin.haalkhata.app", PRODUCTION)).toBe("admin");
    expect(requestSurface("haalkhata.app", PRODUCTION)).toBe("app");
    expect(requestSurface("www.haalkhata.app", PRODUCTION)).toBe("app");
  });

  it("ignores case, surrounding space and a port on the request", () => {
    expect(requestSurface("ADMIN.HaalKhata.app", PRODUCTION)).toBe("admin");
    expect(requestSurface(" admin.haalkhata.app:443 ", PRODUCTION)).toBe("admin");
  });

  it("is not fooled by a hostname that merely contains the admin host", () => {
    expect(requestSurface("admin.haalkhata.app.evil.example", PRODUCTION)).toBe("app");
    expect(requestSurface("notadmin.haalkhata.app", PRODUCTION)).toBe("app");
    expect(requestSurface("evil.example/admin.haalkhata.app", PRODUCTION)).toBe("app");
  });

  it("requires the port too when the configured host names one", () => {
    const withPort = { NODE_ENV: "production", ADMIN_HOST: "admin.localhost:3000" };
    expect(requestSurface("admin.localhost:3000", withPort)).toBe("admin");
    expect(requestSurface("admin.localhost:4000", withPort)).toBe("app");
    expect(requestSurface("admin.localhost", withPort)).toBe("app");
  });

  it("has no admin surface in production until a host is configured", () => {
    expect(requestSurface("admin.haalkhata.app", PRODUCTION_WITHOUT_ADMIN)).toBe("app");
    expect(requestSurface("haalkhata.app", { NODE_ENV: "production", ADMIN_HOST: "  " })).toBe(
      "app",
    );
  });

  it("serves both from one host in development, where there is only localhost", () => {
    expect(requestSurface("127.0.0.1:3000", DEVELOPMENT)).toBe("both");
  });

  it("treats a missing Host header as the app", () => {
    expect(requestSurface(undefined, PRODUCTION)).toBe("app");
    expect(requestSurface(null, PRODUCTION)).toBe("app");
  });

  it("does not let a bracketed IPv6 literal confuse the port split", () => {
    expect(requestSurface("[::1]:3000", PRODUCTION)).toBe("app");
  });
});

describe("pageVerdict", () => {
  it("serves the admin page and the root that redirects to it on the admin host", () => {
    expect(pageVerdict("/", "admin.haalkhata.app", PRODUCTION)).toBe("serve");
    expect(pageVerdict("/admin", "admin.haalkhata.app", PRODUCTION)).toBe("serve");
  });

  it("serves nothing of the app on the admin host", () => {
    for (const pathname of ["/dashboard", "/login", "/activity", "/join/abc", "/admin/extra"]) {
      expect(pageVerdict(pathname, "admin.haalkhata.app", PRODUCTION)).toBe("not-found");
    }
  });

  it("has no admin page on the app host", () => {
    expect(pageVerdict("/admin", "haalkhata.app", PRODUCTION)).toBe("not-found");
    expect(pageVerdict("/admin/", "haalkhata.app", PRODUCTION)).toBe("not-found");
    expect(pageVerdict("/admin/anything", "haalkhata.app", PRODUCTION)).toBe("not-found");
  });

  it("leaves the app's own pages alone, including ones that only start like admin", () => {
    expect(pageVerdict("/dashboard", "haalkhata.app", PRODUCTION)).toBe("serve");
    expect(pageVerdict("/", "haalkhata.app", PRODUCTION)).toBe("serve");
    expect(pageVerdict("/administrators", "haalkhata.app", PRODUCTION)).toBe("serve");
  });

  it("has no admin page anywhere in production without a configured host", () => {
    expect(pageVerdict("/admin", "haalkhata.app", PRODUCTION_WITHOUT_ADMIN)).toBe("not-found");
    expect(pageVerdict("/admin", "admin.haalkhata.app", PRODUCTION_WITHOUT_ADMIN)).toBe(
      "not-found",
    );
  });

  it("serves everything from the one host in development", () => {
    expect(pageVerdict("/admin", "127.0.0.1:3000", DEVELOPMENT)).toBe("serve");
    expect(pageVerdict("/dashboard", "127.0.0.1:3000", DEVELOPMENT)).toBe("serve");
  });
});

describe("rpcAllowedOnSurface", () => {
  it("serves only the admin service on the admin host", () => {
    expect(rpcAllowedOnSurface(ADMIN_RPC, "admin.haalkhata.app", PRODUCTION)).toBe(true);
    expect(rpcAllowedOnSurface(APP_RPC, "admin.haalkhata.app", PRODUCTION)).toBe(false);
    expect(
      rpcAllowedOnSurface(
        "/api/connect/auth.v1.AuthService/LogInWithGoogle",
        "admin.haalkhata.app",
        PRODUCTION,
      ),
    ).toBe(false);
  });

  it("treats the moderation queue as the admin surface's own, on both hosts", () => {
    expect(rpcAllowedOnSurface(MODERATION_RPC, "admin.haalkhata.app", PRODUCTION)).toBe(true);
    expect(rpcAllowedOnSurface(MODERATION_RPC, "haalkhata.app", PRODUCTION)).toBe(false);
    expect(rpcAllowedOnSurface(MODERATION_RPC, "haalkhata.app", PRODUCTION_WITHOUT_ADMIN)).toBe(false);
    const smuggled =
      "/api/connect/expense.v1.ExpenseService/../adminmoderation.v1.AdminModerationService/ListReports";
    expect(rpcAllowedOnSurface(smuggled, "haalkhata.app", PRODUCTION)).toBe(false);
  });

  it("serves everything but the admin service on the app host", () => {
    expect(rpcAllowedOnSurface(APP_RPC, "haalkhata.app", PRODUCTION)).toBe(true);
    expect(rpcAllowedOnSurface(ADMIN_RPC, "haalkhata.app", PRODUCTION)).toBe(false);
  });

  it("resolves dot segments before deciding, so a path cannot smuggle a service through", () => {
    const smuggled =
      "/api/connect/expense.v1.ExpenseService/../adminanalytics.v1.AdminAnalyticsService/GetUsageOverview";
    expect(rpcAllowedOnSurface(smuggled, "haalkhata.app", PRODUCTION)).toBe(false);
    const reverse =
      "/api/connect/adminanalytics.v1.AdminAnalyticsService/../expense.v1.ExpenseService/ListExpenses";
    expect(rpcAllowedOnSurface(reverse, "admin.haalkhata.app", PRODUCTION)).toBe(false);
  });

  it("ignores a query string when reading the path", () => {
    expect(rpcAllowedOnSurface(`${ADMIN_RPC}?connect=v1`, "haalkhata.app", PRODUCTION)).toBe(
      false,
    );
    expect(
      rpcAllowedOnSurface(`${APP_RPC}?x=/adminanalytics.v1.AdminAnalyticsService/`, "haalkhata.app", PRODUCTION),
    ).toBe(true);
  });

  it("has no admin service in production without a configured host", () => {
    expect(rpcAllowedOnSurface(ADMIN_RPC, "haalkhata.app", PRODUCTION_WITHOUT_ADMIN)).toBe(false);
    expect(rpcAllowedOnSurface(ADMIN_RPC, "admin.haalkhata.app", PRODUCTION_WITHOUT_ADMIN)).toBe(
      false,
    );
  });

  it("serves every service from the one host in development", () => {
    expect(rpcAllowedOnSurface(ADMIN_RPC, "127.0.0.1:3000", DEVELOPMENT)).toBe(true);
    expect(rpcAllowedOnSurface(APP_RPC, "127.0.0.1:3000", DEVELOPMENT)).toBe(true);
  });

  it("refuses a request with no usable path on a gated surface", () => {
    expect(rpcAllowedOnSurface(undefined, "admin.haalkhata.app", PRODUCTION)).toBe(false);
  });
});
