/** Transport regressions for SetPhone: which calls meet the SMS send limits. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { SetPhoneRequestSchema } from "@haalkhata/protogen/auth/v1/auth_pb";

vi.mock("@/server/auth/usecase/account/auth.usecase", () => ({}));
vi.mock("@/server/auth/usecase/apple/appleSignIn.usecase", () => ({}));
vi.mock("@/server/auth/usecase/apple/signInOptions.usecase", () => ({ getSignInOptions: vi.fn() }));
vi.mock("@/server/auth/usecase/deletion/accountDeletion.usecase", () => ({ deleteAccount: vi.fn() }));
vi.mock("@/server/auth/usecase/account/contactDiscovery.usecase", () => ({
  setContactDiscovery: vi.fn(),
}));
vi.mock("@/server/auth/usecase/merge/accountMerge.usecase", () => ({
  assertCodeCanBeSent: vi.fn(),
  setPhone: vi.fn().mockResolvedValue({ verificationSent: true, mergeToken: "" }),
}));
vi.mock("@/server/api/connect/context", () => ({
  clearSessionCookie: vi.fn(),
  requireUser: vi.fn().mockResolvedValue("user-123"),
  runUsecase: vi.fn((operation: () => Promise<unknown>) => operation()),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/server/api/connect/credentials", () => ({ wantsBearerToken: vi.fn() }));
vi.mock("@/server/common/rateLimit/rateLimit", () => ({ rateLimitCheck: vi.fn().mockReturnValue(true) }));
vi.mock("@/server/auth/request/clientIp", () => ({ clientIp: vi.fn().mockReturnValue("203.0.113.7") }));
vi.mock("@/server/auth/request/phoneRateLimit", () => ({ enforcePhoneSendLimits: vi.fn() }));

import { enforcePhoneSendLimits } from "@/server/auth/request/phoneRateLimit";
import { rateLimitCheck } from "@/server/common/rateLimit/rateLimit";
import { assertCodeCanBeSent, setPhone } from "@/server/auth/usecase/merge/accountMerge.usecase";
import { authHandler } from "./handler";

const PHONE = "+16175551212";

beforeEach(() => vi.clearAllMocks());

describe("SetPhone send limits", () => {
  it("holds a code of only spaces to the send limits, since it asks for a text", async () => {
    const context = { requestHeader: new Headers() } as HandlerContext;

    await authHandler.setPhone(create(SetPhoneRequestSchema, { phone: PHONE, verificationCode: "  " }), context);

    expect(rateLimitCheck).toHaveBeenCalledWith("phone:send:user-123", expect.any(Number));
    expect(assertCodeCanBeSent).toHaveBeenCalledWith("user-123", PHONE);
    expect(enforcePhoneSendLimits).toHaveBeenCalledWith(PHONE, "203.0.113.7");
    expect(setPhone).toHaveBeenCalledWith("user-123", PHONE, "");
  });

  it("paces a code check without counting it as a send", async () => {
    const context = { requestHeader: new Headers() } as HandlerContext;

    await authHandler.setPhone(
      create(SetPhoneRequestSchema, { phone: PHONE, verificationCode: " 48291375 " }),
      context,
    );

    expect(rateLimitCheck).toHaveBeenCalledWith("phone:check:user-123", expect.any(Number));
    expect(enforcePhoneSendLimits).not.toHaveBeenCalled();
    expect(setPhone).toHaveBeenCalledWith("user-123", PHONE, "48291375");
  });
});
