/** Unit tests for detaching a phone number from the caller's account. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

const { setUserPhoneMock, findUserByIdMock } = vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
  return { setUserPhoneMock: vi.fn(), findUserByIdMock: vi.fn() };
});

vi.mock("@/server/auth/repo/users.repo", () => ({
  bumpTokenVersion: vi.fn(),
  claimUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByGoogleSub: vi.fn(),
  findUserById: findUserByIdMock,
  findUserByPhone: vi.fn(),
  findUserTokenVersion: vi.fn(),
  insertUser: vi.fn(),
  linkGoogleAccount: vi.fn(),
  markOnboarded: vi.fn(),
  setAvatarUrl: vi.fn(),
  setUserPhone: setUserPhoneMock,
  updateUserProfile: vi.fn(),
}));
vi.mock("@/server/auth/repo/paymentHandles.repo", () => ({ replacePaymentHandles: vi.fn() }));
vi.mock("@/server/auth/repo/googleSignInNonces.repo", () => ({
  consumeGoogleSignInNonce: vi.fn(),
  insertGoogleSignInNonce: vi.fn(),
}));

import { removePhone } from "./auth.usecase";

/**
 * Builds a users row with defaults for the columns a test does not care about.
 *
 * @param overrides - Columns to set explicitly.
 * @returns A complete UserRow.
 */
function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    email: "me@example.com",
    name: "Anirudha",
    avatar_color: "#c73e2e",
    avatar_url: null,
    default_currency: "USD",
    password_hash: null,
    phone: "+16175551212",
    google_sub: "google-sub-1",
    onboarded_at: null,
    phone_verified_at: null,
    merged_into: null,
    token_version: 0,
    created_at: "2026-07-27T00:00:00.000Z",
    payment_handles: [],
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("removePhone", () => {
  it("clears the number when the account keeps an email to be found by", async () => {
    findUserByIdMock
      .mockResolvedValueOnce(userRow())
      .mockResolvedValueOnce(userRow({ phone: null }));

    const result = await removePhone("user-1");

    expect(setUserPhoneMock).toHaveBeenCalledWith("user-1", null);
    expect(result.phone).toBe("");
  });

  it("is a no-op when no phone is set", async () => {
    findUserByIdMock.mockResolvedValue(userRow({ phone: null }));

    const result = await removePhone("user-1");

    expect(setUserPhoneMock).not.toHaveBeenCalled();
    expect(result.phone).toBe("");
  });

  it("refuses when the phone is the account's only identifier", async () => {
    // chk_users_has_identifier as a sentence: a live row must stay reachable.
    findUserByIdMock.mockResolvedValue(userRow({ email: null }));

    await expect(removePhone("user-1")).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("only way your account can be found"),
    });
    expect(setUserPhoneMock).not.toHaveBeenCalled();
  });

  it("rejects a caller whose account row is gone", async () => {
    findUserByIdMock.mockResolvedValue(undefined);

    await expect(removePhone("user-1")).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
