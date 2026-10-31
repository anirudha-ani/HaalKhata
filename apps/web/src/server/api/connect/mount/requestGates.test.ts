/**
 * The request gates — what runs before a body is read — agree with the
 * handlers: exactly the RPCs whose handlers work without a session are let
 * through without one, every service is wired to its gate and cap, and a
 * gate refuses a missing or forged session.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ConnectRouter, HandlerContext } from "@connectrpc/connect";
import type { DescService } from "@bufbuild/protobuf";
import { AuthService } from "@haalkhata/protogen/auth/v1/auth_pb";
import { ExpenseService } from "@haalkhata/protogen/expense/v1/expense_pb";
import { GroupService } from "@haalkhata/protogen/group/v1/group_pb";
import { PaymentMethodService } from "@haalkhata/protogen/payment/v1/payment_pb";
import { PersonalAnalyticsService } from "@haalkhata/protogen/personalanalytics/v1/personalanalytics_pb";
import { PushService } from "@haalkhata/protogen/push/v1/push_pb";
import { ReceiptService } from "@haalkhata/protogen/receipt/v1/receipt_pb";
import { SafetyService } from "@haalkhata/protogen/safety/v1/safety_pb";
import { SocialService } from "@haalkhata/protogen/social/v1/social_pb";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
});

import routes from "../routes";
import { requireAdminPageRequest } from "../admin/adminRequest";
import { EXPENSE_READ_MAX_BYTES, RECEIPT_READ_MAX_BYTES, SOCIAL_READ_MAX_BYTES } from "../connect.constants";
import { requireSignedSession } from "../context";
import { authRequestGate } from "@/server/auth/handler";
import { socialRequestGate } from "@/server/social/handler";
import { ANONYMOUS_AUTH_RPCS } from "@/server/auth/auth.constants";
import { ANONYMOUS_SOCIAL_RPCS } from "@/server/social/social.constants";
import { createToken } from "@/server/auth/usecase/session/session";

const SERVER_DIRECTORY = path.resolve(__dirname, "../../..");

/** Each app service, the handler file implementing it, and the RPCs its gate lets through without a session. */
const SERVICES: { service: DescService; handlerFile: string; anonymous: ReadonlySet<string> }[] = [
  { service: AuthService, handlerFile: "auth/handler.ts", anonymous: ANONYMOUS_AUTH_RPCS },
  { service: SocialService, handlerFile: "social/handler.ts", anonymous: ANONYMOUS_SOCIAL_RPCS },
  { service: ExpenseService, handlerFile: "expense/handler.ts", anonymous: new Set() },
  { service: GroupService, handlerFile: "group/handler.ts", anonymous: new Set() },
  { service: PaymentMethodService, handlerFile: "payment/handler.ts", anonymous: new Set() },
  { service: PersonalAnalyticsService, handlerFile: "personalanalytics/handler.ts", anonymous: new Set() },
  { service: PushService, handlerFile: "push/handler.ts", anonymous: new Set() },
  { service: ReceiptService, handlerFile: "receipt/handler.ts", anonymous: new Set() },
  { service: SafetyService, handlerFile: "safety/handler.ts", anonymous: new Set() },
];

/**
 * The source of one method of a handler object.
 *
 * @param source - The handler file's text.
 * @param localName - The method's name in TypeScript.
 * @returns Its text, from its name to the next method's.
 */
function methodSource(source: string, localName: string): string {
  const start = source.search(new RegExp(`^  (?:async )?${localName}\\(`, "m"));
  if (start < 0) return "";
  const rest = source.slice(start + 1);
  const next = rest.search(/^ {2}(?:async )?[a-z][A-Za-z]+\(/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * A handler context carrying only what a gate reads.
 *
 * @param methodName - The RPC's proto name.
 * @param token - A session token to send, or none.
 * @returns The context.
 */
function contextFor(methodName: string, token = ""): HandlerContext {
  return {
    method: { name: methodName },
    requestHeader: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  } as unknown as HandlerContext;
}

describe("request gates", () => {
  it.each(SERVICES)("let through without a session exactly the $service.typeName calls that need none", ({ service, handlerFile, anonymous }) => {
    const source = readFileSync(path.join(SERVER_DIRECTORY, handlerFile), "utf8");
    const needsNoSession = service.methods
      .filter((method) => !/require(User|RateLimitedUser)\(/.test(methodSource(source, method.localName)))
      .map((method) => method.name)
      .sort();

    expect([...anonymous].sort()).toEqual(needsNoSession);
  });

  it("wire every service to its gate and cap, and the rest to the mount's defaults", () => {
    const options = new Map<string, unknown>();
    routes({
      service: (service: DescService, _implementation: unknown, serviceOptions?: unknown) => {
        options.set(service.typeName, serviceOptions);
      },
    } as unknown as ConnectRouter);

    expect(options.get("auth.v1.AuthService")).toEqual({ requestGate: authRequestGate });
    expect(options.get("social.v1.SocialService")).toEqual({
      readMaxBytes: SOCIAL_READ_MAX_BYTES,
      requestGate: socialRequestGate,
    });
    expect(options.get("expense.v1.ExpenseService")).toEqual({ readMaxBytes: EXPENSE_READ_MAX_BYTES });
    expect(options.get("receipt.v1.ReceiptService")).toEqual({ readMaxBytes: RECEIPT_READ_MAX_BYTES });
    expect(options.get("adminanalytics.v1.AdminAnalyticsService")).toEqual({ requestGate: requireAdminPageRequest });
    expect(options.get("adminmoderation.v1.AdminModerationService")).toEqual({ requestGate: requireAdminPageRequest });
    for (const typeName of [
      "group.v1.GroupService",
      "payment.v1.PaymentMethodService",
      "push.v1.PushService",
      "personalanalytics.v1.PersonalAnalyticsService",
      "safety.v1.SafetyService",
    ]) {
      expect(options.get(typeName), typeName).toBeUndefined();
    }
  });

  it("refuse a call that needs a session when there is none, or only a forged one", () => {
    const signed = createToken("user-gated", 0, "session-gated");
    const forged = `${signed.slice(0, -4)}AAAA`;

    expect(() => requireSignedSession(contextFor("ListExpenses"))).toThrow(/sign in to continue/);
    expect(() => requireSignedSession(contextFor("ListExpenses", forged))).toThrow(/sign in to continue/);
    expect(() => requireSignedSession(contextFor("ListExpenses", signed))).not.toThrow();
    expect(() => authRequestGate(contextFor("SetPhone"))).toThrow(/sign in to continue/);
    expect(() => socialRequestGate(contextFor("AddFriend"))).toThrow(/sign in to continue/);
  });

  it("let the sign-in and invite-preview calls through without a session", () => {
    expect(() => authRequestGate(contextFor("LogInWithGoogle"))).not.toThrow();
    expect(() => socialRequestGate(contextFor("PreviewInviteLink"))).not.toThrow();
  });
});
