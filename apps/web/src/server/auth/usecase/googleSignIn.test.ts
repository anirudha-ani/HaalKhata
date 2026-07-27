/** Unit tests for the Google ID-token sign-in branches: link, claim, create, reject. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

// Inside vi.hoisted because `import` is evaluated before any plain statement in
// the module body: auth.constants reads GOOGLE_CLIENT_ID at import time, so a
// top-level assignment here would land too late and leave it empty.
const { verifyIdTokenMock } = vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  return { verifyIdTokenMock: vi.fn() };
});

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    /** Delegates to the shared spy so tests can script each verification. */
    verifyIdToken(options: unknown) {
      return verifyIdTokenMock(options);
    }
  },
}));

vi.mock("@/server/auth/repo/users.repo", () => ({
  bumpTokenVersion: vi.fn(),
  claimUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByGoogleSub: vi.fn(),
  findUserById: vi.fn(),
  findUserByPhone: vi.fn(),
  insertUser: vi.fn(),
  linkGoogleAccount: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock("@/server/auth/repo/paymentHandles.repo", () => ({
  replacePaymentHandles: vi.fn(),
}));

import { logInWithGoogle } from "./auth.usecase";
import {
  findUserByEmail,
  findUserByGoogleSub,
  findUserById,
  insertUser,
  linkGoogleAccount,
} from "@/server/auth/repo/users.repo";

/**
 * Builds a users row with sensible defaults for the fields a test does not care
 * about.
 *
 * @param overrides - Columns to set explicitly.
 * @returns A complete UserRow.
 */
function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    email: "anirudha@example.com",
    name: "Anirudha",
    avatar_color: "#c73e2e",
    default_currency: "USD",
    password_hash: null,
    phone: null,
    google_sub: null,
    token_version: 0,
    created_at: "2026-07-27T00:00:00.000Z",
    payment_handles: [],
    ...overrides,
  };
}

/**
 * Points the mocked verifier at a successful Google response.
 *
 * @param payload - Claims the ID token should appear to carry.
 */
function googleReturns(payload: Record<string, unknown>): void {
  verifyIdTokenMock.mockResolvedValue({ getPayload: () => payload });
}

const VERIFIED = {
  sub: "google-sub-123",
  email: "Anirudha@Example.com",
  email_verified: true,
  name: "Anirudha Paul",
};

describe("logInWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the already-linked account without touching email lookup", async () => {
    googleReturns(VERIFIED);
    vi.mocked(findUserByGoogleSub).mockResolvedValue(userRow({ google_sub: "google-sub-123" }));

    const result = await logInWithGoogle("id-token");

    expect(result.user.id).toBe("user-1");
    expect(result.token).toContain("user-1.");
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(insertUser).not.toHaveBeenCalled();
  });

  it("claims a shadow user by verified email and takes Google's display name", async () => {
    googleReturns(VERIFIED);
    vi.mocked(findUserByGoogleSub).mockResolvedValue(undefined);
    // Shadow: no password and no Google account yet, named after the local part.
    vi.mocked(findUserByEmail).mockResolvedValue(userRow({ name: "anirudha" }));
    vi.mocked(findUserById).mockResolvedValue(
      userRow({ name: "Anirudha Paul", google_sub: "google-sub-123" }),
    );

    const result = await logInWithGoogle("id-token");

    expect(linkGoogleAccount).toHaveBeenCalledWith("user-1", "google-sub-123", "Anirudha Paul");
    expect(result.user.registered).toBe(true);
    expect(insertUser).not.toHaveBeenCalled();
  });

  it("never overwrites the name on an already-registered account", async () => {
    googleReturns(VERIFIED);
    vi.mocked(findUserByGoogleSub).mockResolvedValue(undefined);
    vi.mocked(findUserByEmail).mockResolvedValue(
      userRow({ name: "Ani", password_hash: "salt:hash" }),
    );
    vi.mocked(findUserById).mockResolvedValue(
      userRow({ name: "Ani", password_hash: "salt:hash", google_sub: "google-sub-123" }),
    );

    await logInWithGoogle("id-token");

    expect(linkGoogleAccount).toHaveBeenCalledWith("user-1", "google-sub-123", "");
  });

  it("creates a new account, lowercasing the email from the token", async () => {
    googleReturns(VERIFIED);
    vi.mocked(findUserByGoogleSub).mockResolvedValue(undefined);
    vi.mocked(findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(insertUser).mockResolvedValue(userRow({ google_sub: "google-sub-123" }));

    await logInWithGoogle("id-token");

    expect(insertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "anirudha@example.com",
        name: "Anirudha Paul",
        googleSub: "google-sub-123",
        passwordHash: null,
      }),
    );
  });

  it("rejects an unverified email rather than linking on it", async () => {
    googleReturns({ ...VERIFIED, email_verified: false });

    await expect(logInWithGoogle("id-token")).rejects.toThrow(/not verified/);
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(linkGoogleAccount).not.toHaveBeenCalled();
  });

  it("rejects a token that fails signature/audience verification", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("Wrong recipient"));

    await expect(logInWithGoogle("id-token")).rejects.toThrow(/could not verify/);
    expect(findUserByGoogleSub).not.toHaveBeenCalled();
  });

  it("rejects a verified token carrying no email", async () => {
    googleReturns({ sub: "google-sub-123", email_verified: true });

    await expect(logInWithGoogle("id-token")).rejects.toThrow(/could not verify/);
  });

  it("recovers from a concurrent-signin unique violation instead of throwing", async () => {
    googleReturns(VERIFIED);
    vi.mocked(findUserByGoogleSub)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(userRow({ google_sub: "google-sub-123" }));
    vi.mocked(findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(insertUser).mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));

    const result = await logInWithGoogle("id-token");

    expect(result.user.id).toBe("user-1");
  });
});
