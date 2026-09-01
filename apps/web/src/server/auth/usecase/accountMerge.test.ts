/** Unit tests for the phone-claim decision tree and merge-token authorization. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

const {
  setUserPhoneMock,
  mergeAccountsMock,
  previewMergeMock,
  startPhoneVerificationMock,
  confirmPhoneVerificationMock,
  beginPhoneVerificationMock,
  spendPhoneCheckAttemptMock,
  consumePhoneVerificationMock,
} = vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
  return {
    setUserPhoneMock: vi.fn(),
    mergeAccountsMock: vi.fn(),
    previewMergeMock: vi.fn(),
    startPhoneVerificationMock: vi.fn(),
    confirmPhoneVerificationMock: vi.fn(),
    beginPhoneVerificationMock: vi.fn(),
    spendPhoneCheckAttemptMock: vi.fn(),
    consumePhoneVerificationMock: vi.fn(),
  };
});

vi.mock("@/server/auth/repo/users.repo", () => ({
  bumpTokenVersion: vi.fn(),
  claimUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByGoogleSub: vi.fn(),
  findUserById: vi.fn(),
  findUserByPhone: vi.fn(),
  insertUser: vi.fn(),
  linkGoogleAccount: vi.fn(),
  markOnboarded: vi.fn(),
  setUserPhone: setUserPhoneMock,
  updateUserProfile: vi.fn(),
}));

vi.mock("@/server/auth/repo/accountMerge.repo", () => ({
  mergeAccounts: mergeAccountsMock,
  previewMerge: previewMergeMock,
}));

vi.mock("@/server/auth/repo/phoneVerifications.repo", () => ({
  beginPhoneVerification: beginPhoneVerificationMock,
  spendPhoneCheckAttempt: spendPhoneCheckAttemptMock,
  consumePhoneVerification: consumePhoneVerificationMock,
}));

vi.mock("@/server/common/logger", () => ({ logEvent: vi.fn(), logError: vi.fn() }));

vi.mock("@/server/auth/repo/paymentHandles.repo", () => ({
  replacePaymentHandles: vi.fn(),
}));

vi.mock("./phoneVerification", () => ({
  startPhoneVerification: startPhoneVerificationMock,
  confirmPhoneVerification: confirmPhoneVerificationMock,
}));

import { confirmPhoneMerge, setPhone } from "./accountMerge.usecase";
import { findUserById, findUserByPhone } from "@/server/auth/repo/users.repo";

const KEEPER = "keeper-1";
const LOSER = "loser-1";
const PHONE = "+16175551212";

/**
 * Builds a users row with defaults for the columns a test does not care about.
 *
 * @param overrides - Columns to set explicitly.
 * @returns A complete UserRow.
 */
function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: KEEPER,
    email: "me@example.com",
    name: "Anirudha",
    avatar_color: "#c73e2e",
    avatar_url: null,
    default_currency: "USD",
    password_hash: null,
    phone: null,
    google_sub: "google-sub-1",
    onboarded_at: null,
    merged_into: null,
    token_version: 0,
    created_at: "2026-07-27T00:00:00.000Z",
    payment_handles: [],
    ...overrides,
  };
}

/** An unclaimed row created by a phone invite — no password, no Google account. */
const invitedRow = userRow({
  id: LOSER,
  email: null,
  name: "Ani",
  phone: PHONE,
  google_sub: null,
});

describe("setPhone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendPhoneCheckAttemptMock.mockResolvedValue("ok");
    vi.mocked(findUserById).mockResolvedValue(userRow({ phone: PHONE }));
    previewMergeMock.mockResolvedValue({
      name: "Ani",
      expense_count: 4,
      nets: { USD: -8700 },
      counterparty_names: ["Rahul", "Priya"],
    });
  });

  it("sends a code without looking up or changing the account", async () => {
    const result = await setPhone(KEEPER, "(617) 555-1212", "");

    expect(startPhoneVerificationMock).toHaveBeenCalledWith(PHONE);
    // The server records its own verification state, bound to this account
    // and number, before the provider is asked to deliver anything.
    expect(beginPhoneVerificationMock).toHaveBeenCalledWith(KEEPER, PHONE, expect.any(Number));
    expect(beginPhoneVerificationMock.mock.invocationCallOrder[0]).toBeLessThan(
      startPhoneVerificationMock.mock.invocationCallOrder[0],
    );
    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(setUserPhoneMock).not.toHaveBeenCalled();
    expect(previewMergeMock).not.toHaveBeenCalled();
    expect(result).toEqual({ verificationSent: true, mergeToken: "" });
  });

  it("refuses a code check no send of this account's ever set up", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue("no_verification");

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("no longer active"),
    });
    // The provider is never consulted for a check the server did not arm:
    // the binding to (account, number) is ours, not Twilio's.
    expect(confirmPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("refuses further codes once the attempt budget is spent", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue("exhausted");

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("too many incorrect codes"),
    });
    expect(confirmPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("consumes the verification on approval, making it single-use here", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    await setPhone(KEEPER, PHONE, "123456");

    expect(consumePhoneVerificationMock).toHaveBeenCalledWith(KEEPER);
  });

  it("caps how many counterparty names a preview discloses", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(invitedRow);
    previewMergeMock.mockResolvedValue({
      name: "Ani",
      expense_count: 40,
      nets: { USD: -8700 },
      counterparty_names: Array.from({ length: 40 }, (_, index) => `Person ${index}`),
    });

    const result = await setPhone(KEEPER, PHONE, "123456");

    expect(result.pendingMerge?.counterpartyNames).toHaveLength(12);
  });

  it("writes the number straight through when nothing holds it", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    const result = await setPhone(KEEPER, "(617) 555-1212", "123456");

    expect(confirmPhoneVerificationMock).toHaveBeenCalledWith(PHONE, "123456");
    expect(setUserPhoneMock).toHaveBeenCalledWith(KEEPER, PHONE);
    expect(result.user?.phone).toBe(PHONE);
    expect(result.pendingMerge).toBeUndefined();
    expect(result.mergeToken).toBe("");
  });

  it("turns a concurrent claimed-account unique race into a conflict", async () => {
    const concurrentHolder = userRow({
      id: "someone-else",
      phone: PHONE,
      google_sub: "google-sub-2",
    });
    vi.mocked(findUserByPhone)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(concurrentHolder);
    setUserPhoneMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate phone"), { code: "23505" }),
    );

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toMatchObject({
      code: "already_exists",
      message: expect.stringContaining("already on another account"),
    });
    expect(findUserByPhone).toHaveBeenCalledTimes(2);
    expect(previewMergeMock).not.toHaveBeenCalled();
  });

  it("previews a concurrent unclaimed-invite unique race", async () => {
    vi.mocked(findUserByPhone)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(invitedRow);
    setUserPhoneMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate phone"), { code: "23505" }),
    );

    const result = await setPhone(KEEPER, PHONE, "123456");

    expect(result.pendingMerge?.name).toBe("Ani");
    expect(result.mergeToken).not.toBe("");
    expect(previewMergeMock).toHaveBeenCalledWith(LOSER);
  });

  it("does not disguise unrelated database failures as phone conflicts", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);
    const databaseFailure = Object.assign(new Error("connection lost"), { code: "08006" });
    setUserPhoneMock.mockRejectedValueOnce(databaseFailure);

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toBe(databaseFailure);
    expect(findUserByPhone).toHaveBeenCalledTimes(1);
  });

  it("normalizes a national format before looking for a holder", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    await setPhone(KEEPER, "617-555-1212", "123456");

    expect(findUserByPhone).toHaveBeenCalledWith(PHONE);
  });

  it("is a no-op re-save when the caller already holds the number", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(userRow({ phone: PHONE }));

    const result = await setPhone(KEEPER, PHONE, "123456");

    expect(result.user).toBeDefined();
    expect(result.pendingMerge).toBeUndefined();
  });

  it("previews rather than merges when an unclaimed invite holds it", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(invitedRow);

    const result = await setPhone(KEEPER, PHONE, "123456");

    // Nothing may be written before the caller has seen what they would take on.
    expect(setUserPhoneMock).not.toHaveBeenCalled();
    expect(mergeAccountsMock).not.toHaveBeenCalled();
    expect(result.user).toBeUndefined();
    expect(result.pendingMerge).toEqual({
      name: "Ani",
      expenseCount: 4,
      netCents: -8700,
      nets: [{ currency: "USD", cents: -8700 }],
      counterpartyNames: ["Rahul", "Priya"],
    });
    expect(result.mergeToken).not.toBe("");
  });

  it("rejects a merge preview whose aggregate cannot fit its protobuf field", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(invitedRow);
    previewMergeMock.mockResolvedValue({
      name: "Ani",
      expense_count: 4,
      nets: { USD: 4000000000 },
      counterparty_names: ["Rahul"],
    });

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringMatching(/larger than this app can represent/),
    });
  });

  it("refuses a number held by a Google account", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(
      userRow({ id: "someone-else", phone: PHONE, google_sub: "google-sub-2" }),
    );

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toThrow(/already on another account/);
    expect(setUserPhoneMock).not.toHaveBeenCalled();
  });

  it("refuses a number held by a password account", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(
      userRow({ id: "someone-else", phone: PHONE, google_sub: null, password_hash: "salt:hash" }),
    );

    await expect(setPhone(KEEPER, PHONE, "123456")).rejects.toThrow(/already on another account/);
  });

  it("rejects an unparseable number before any lookup", async () => {
    await expect(setPhone(KEEPER, "not-a-number", "123456")).rejects.toThrow(/valid phone number/);
    expect(findUserByPhone).not.toHaveBeenCalled();
  });
});

describe("confirmPhoneMerge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendPhoneCheckAttemptMock.mockResolvedValue("ok");
    previewMergeMock.mockResolvedValue({
      name: "Ani",
      expense_count: 4,
      nets: { USD: -8700 },
      counterparty_names: ["Rahul"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Runs setPhone against a colliding invite to obtain a genuine signed token.
   *
   * @returns The merge token SetPhone issued.
   */
  async function issueToken(): Promise<string> {
    vi.mocked(findUserByPhone).mockResolvedValue(invitedRow);
    const result = await setPhone(KEEPER, PHONE, "123456");
    return result.mergeToken;
  }

  it("merges when the token, the row and the number all still agree", async () => {
    const token = await issueToken();
    vi.mocked(findUserById)
      .mockResolvedValueOnce(invitedRow)
      .mockResolvedValueOnce(userRow({ phone: PHONE }));

    const result = await confirmPhoneMerge(KEEPER, token);

    expect(mergeAccountsMock).toHaveBeenCalledWith(KEEPER, LOSER, PHONE);
    expect(result.phone).toBe(PHONE);
  });

  it("refuses a token issued to a different account", async () => {
    const token = await issueToken();

    await expect(confirmPhoneMerge("someone-else", token)).rejects.toThrow(
      /belongs to another account/,
    );
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });

  it("refuses a tampered token", async () => {
    const token = await issueToken();
    const tampered = token.replace(LOSER, "other-row");

    await expect(confirmPhoneMerge(KEEPER, tampered)).rejects.toThrow(/no longer valid/);
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });

  it("refuses an expired token", async () => {
    const token = await issueToken();
    // Merge tokens last ten minutes; jump past that.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);

    await expect(confirmPhoneMerge(KEEPER, token)).rejects.toThrow(/no longer valid/);
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });

  it("refuses when the row was claimed between preview and confirm", async () => {
    const token = await issueToken();
    // The rightful owner signed in during those seconds — absorbing it now
    // would take a live account.
    vi.mocked(findUserById).mockResolvedValue(
      userRow({ id: LOSER, phone: PHONE, google_sub: "google-sub-9" }),
    );

    await expect(confirmPhoneMerge(KEEPER, token)).rejects.toThrow(/already on another account/);
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });

  it("refuses when the row was already absorbed by someone else", async () => {
    const token = await issueToken();
    vi.mocked(findUserById).mockResolvedValue(
      userRow({ id: LOSER, phone: null, google_sub: null, merged_into: "other-keeper" }),
    );

    await expect(confirmPhoneMerge(KEEPER, token)).rejects.toThrow(/no longer exists/);
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });

  it("refuses when the row no longer carries the number the token names", async () => {
    const token = await issueToken();
    vi.mocked(findUserById).mockResolvedValue(
      userRow({ id: LOSER, phone: "+14155552671", google_sub: null }),
    );

    await expect(confirmPhoneMerge(KEEPER, token)).rejects.toThrow(/no longer valid/);
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });

  it("refuses when the balances changed since the preview the user read", async () => {
    const token = await issueToken();
    vi.mocked(findUserById)
      .mockResolvedValueOnce(invitedRow)
      .mockResolvedValueOnce(userRow({ phone: PHONE }));
    // An expense landed on the invited row inside the token's ten minutes —
    // the history on screen is no longer the history that would be absorbed.
    previewMergeMock.mockResolvedValue({
      name: "Ani",
      expense_count: 5,
      nets: { USD: -12000 },
      counterparty_names: ["Rahul"],
    });

    await expect(confirmPhoneMerge(KEEPER, token)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("changed since the preview"),
    });
    expect(mergeAccountsMock).not.toHaveBeenCalled();
  });
});
