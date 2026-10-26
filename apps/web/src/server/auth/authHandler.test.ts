/** Transport regressions for the phone RPCs: which limiter each of SetPhone's limits runs, and the retired merge. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Code, type HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import {
  ConfirmPhoneMergeRequestSchema,
  SetPhoneRequestSchema,
} from "@haalkhata/protogen/auth/v1/auth_pb";

vi.mock("@/server/auth/usecase/account/auth.usecase", () => ({}));
vi.mock("@/server/auth/usecase/apple/appleSignIn.usecase", () => ({}));
vi.mock("@/server/auth/usecase/apple/signInOptions.usecase", () => ({ getSignInOptions: vi.fn() }));
vi.mock("@/server/auth/usecase/deletion/accountDeletion.usecase", () => ({ deleteAccount: vi.fn() }));
vi.mock("@/server/auth/usecase/account/contactDiscovery.usecase", () => ({
  setContactDiscovery: vi.fn(),
}));
vi.mock("@/server/auth/usecase/phone/setPhone.usecase", () => ({
  setPhone: vi.fn().mockResolvedValue({ verificationSent: true }),
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
import {
  setPhone,
  type PhoneRequestLimits,
} from "@/server/auth/usecase/phone/setPhone.usecase";
import { authHandler } from "./handler";

const PHONE = "+16175551212";

/**
 * Calls SetPhone through the handler and returns the limits it handed the usecase.
 *
 * @param verificationCode - The request's code, passed through untouched.
 * @returns The limits the usecase received.
 */
async function limitsHandedOver(verificationCode: string): Promise<PhoneRequestLimits> {
  const context = { requestHeader: new Headers() } as HandlerContext;
  await authHandler.setPhone(create(SetPhoneRequestSchema, { phone: PHONE, verificationCode }), context);
  const [userId, phone, code, limits] = vi.mocked(setPhone).mock.calls[0];
  expect([userId, phone, code]).toEqual(["user-123", PHONE, verificationCode]);
  return limits;
}

beforeEach(() => vi.clearAllMocks());

describe("SetPhone limits", () => {
  it("leaves send or check to the usecase, which trims the code", async () => {
    await limitsHandedOver("  ");

    expect(rateLimitCheck).not.toHaveBeenCalled();
    expect(enforcePhoneSendLimits).not.toHaveBeenCalled();
  });

  it("paces a send per account, then holds it to the number's and the address's ceilings", async () => {
    const limits = await limitsHandedOver("");

    await limits.beforeSend(PHONE);

    expect(rateLimitCheck).toHaveBeenCalledWith("phone:send:user-123", 3);
    expect(enforcePhoneSendLimits).toHaveBeenCalledWith(PHONE, "203.0.113.7");
  });

  it("paces a check in its own bucket, without the send ceilings", async () => {
    const limits = await limitsHandedOver("48291375");

    limits.beforeCheck();

    expect(rateLimitCheck).toHaveBeenCalledWith("phone:check:user-123", 5);
    expect(enforcePhoneSendLimits).not.toHaveBeenCalled();
  });
});

describe("ConfirmPhoneMerge", () => {
  it("is refused with a reason an installed app can show, merging nothing", async () => {
    const context = { requestHeader: new Headers() } as HandlerContext;

    await expect(
      authHandler.confirmPhoneMerge(create(ConfirmPhoneMergeRequestSchema, { mergeToken: "any" }), context),
    ).rejects.toMatchObject({ code: Code.FailedPrecondition, rawMessage: expect.stringContaining("nothing to merge") });
    expect(setPhone).not.toHaveBeenCalled();
  });
});
