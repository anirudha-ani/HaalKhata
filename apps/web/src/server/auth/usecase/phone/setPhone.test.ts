/** Unit tests for setting a phone number: the SMS code checks and the §34 transfer. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/auth/repo/users.repo";

const {
  setUserPhoneMock,
  startPhoneVerificationMock,
  checkPhoneVerificationMock,
  beginPhoneVerificationMock,
  spendPhoneCheckAttemptMock,
  consumePhoneVerificationMock,
  forgetPhoneVerificationMock,
  findPhoneVerificationMock,
  exhaustPhoneVerificationMock,
  recordProviderVerificationMock,
  logEventMock,
} = vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-0123456789abcdef";
  return {
    setUserPhoneMock: vi.fn(),
    startPhoneVerificationMock: vi.fn(),
    checkPhoneVerificationMock: vi.fn(),
    beginPhoneVerificationMock: vi.fn(),
    spendPhoneCheckAttemptMock: vi.fn(),
    consumePhoneVerificationMock: vi.fn(),
    forgetPhoneVerificationMock: vi.fn(),
    findPhoneVerificationMock: vi.fn(),
    exhaustPhoneVerificationMock: vi.fn(),
    recordProviderVerificationMock: vi.fn(),
    logEventMock: vi.fn(),
  };
});

vi.mock("@/server/auth/repo/users.repo", () => ({
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

vi.mock("@/server/auth/repo/phone/phoneVerifications.repo", () => ({
  beginPhoneVerification: beginPhoneVerificationMock,
  spendPhoneCheckAttempt: spendPhoneCheckAttemptMock,
  consumePhoneVerification: consumePhoneVerificationMock,
  forgetPhoneVerification: forgetPhoneVerificationMock,
  findPhoneVerification: findPhoneVerificationMock,
  exhaustPhoneVerification: exhaustPhoneVerificationMock,
  recordProviderVerification: recordProviderVerificationMock,
}));

vi.mock("@/server/common/logger", () => ({ logEvent: logEventMock, logError: vi.fn() }));

vi.mock("./phoneVerification", () => ({
  startPhoneVerification: startPhoneVerificationMock,
  checkPhoneVerification: checkPhoneVerificationMock,
}));

const { transferClient } = vi.hoisted(() => ({
  transferClient: { query: vi.fn() } as unknown as import("pg").PoolClient,
}));
vi.mock("@/server/common/db/db", () => ({
  transaction: vi.fn((operation: (client: import("pg").PoolClient) => Promise<unknown>) =>
    operation(transferClient),
  ),
  isUniqueViolation: vi.fn(
    (error: unknown) => (error as { code?: string } | null)?.code === "23505",
  ),
}));
vi.mock("@/server/social/repo/notifications.repo", () => ({ insertNotifications: vi.fn() }));

import { insertNotifications } from "@/server/social/repo/notifications.repo";
import { setPhone } from "./setPhone.usecase";
import { findUserById, findUserByPhone } from "@/server/auth/repo/users.repo";

const KEEPER = "keeper-1";
const PHONE = "+16175551212";
const CODE = "48291375";

/** An expiry nine and a half minutes out, as the repo returns it. */
function liveExpiry(): string {
  return new Date(Date.now() + 9.5 * 60 * 1000).toISOString();
}

/** The transport's limits, as the handler hands them over; each test sees fresh calls. */
const limits = { beforeSend: vi.fn(), beforeCheck: vi.fn() };

/** Twilio's id for the verification the tests check codes against. */
const PROVIDER_SID = "VE00000000000000000000000000000001";

/** When Twilio created that verification, as its send answer says. */
const PROVIDER_CREATED_AT = "2026-10-24T09:00:00Z";

/** A spent attempt, the way the repo reports it. */
function spentAttempt(checkCount = 1, checksKnown = true) {
  return {
    status: "ok" as const,
    checkCount,
    expiresAt: liveExpiry(),
    providerSid: PROVIDER_SID,
    checksKnown,
  };
}

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
    phone_verified_at: null,
    token_version: 0,
    created_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("setPhone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(transferClient.query).mockResolvedValue({ rows: [{ id: "someone-else" }] } as never);
    spendPhoneCheckAttemptMock.mockResolvedValue(spentAttempt());
    checkPhoneVerificationMock.mockResolvedValue("approved");
    findPhoneVerificationMock.mockResolvedValue(undefined);
    startPhoneVerificationMock.mockResolvedValue({
      sid: PROVIDER_SID,
      createdAt: PROVIDER_CREATED_AT,
    });
    vi.mocked(findUserById).mockResolvedValue(userRow({ phone: PHONE }));
  });

  it("sends a code without looking up or changing the account", async () => {
    const result = await setPhone(KEEPER, "(617) 555-1212", "", limits);

    expect(startPhoneVerificationMock).toHaveBeenCalledWith(PHONE);
    // The server records its own verification state, bound to this account
    // and number, before the provider is asked to deliver anything.
    expect(beginPhoneVerificationMock).toHaveBeenCalledWith(KEEPER, PHONE, expect.any(Number));
    expect(beginPhoneVerificationMock.mock.invocationCallOrder[0]).toBeLessThan(
      startPhoneVerificationMock.mock.invocationCallOrder[0],
    );
    // Then it follows the verification the provider says the send reached,
    // so the expiry counts from Twilio's creation, not from the first try,
    // and the count from whether this send created it.
    expect(recordProviderVerificationMock).toHaveBeenCalledWith(
      KEEPER,
      PHONE,
      { sid: PROVIDER_SID, createdAt: PROVIDER_CREATED_AT, startedAt: expect.any(String) },
      600,
      5,
    );
    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(setUserPhoneMock).not.toHaveBeenCalled();
    expect(result).toEqual({ verificationSent: true });
  });

  it("refuses a code check no send of this account's ever set up", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue({ status: "no_verification" });

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("no longer active"),
    });
    // The provider is never consulted for a check the server did not arm:
    // the binding to (account, number) is ours, not Twilio's.
    expect(checkPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("refuses further codes once the attempt budget is spent", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue({ status: "exhausted", expiresAt: liveExpiry() });

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("too many incorrect codes"),
    });
    expect(checkPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("refuses a send while the verification is out of attempts, with the minutes left", async () => {
    findPhoneVerificationMock.mockResolvedValue({ check_count: 5, expires_at: liveExpiry() });

    await expect(setPhone(KEEPER, PHONE, "", limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "too many incorrect codes, you can ask for a new one in 10 minutes",
    });
    // Twilio keeps the exhausted verification until it expires; a resend
    // would carry the same code to checks that can only fail.
    expect(beginPhoneVerificationMock).not.toHaveBeenCalled();
    expect(startPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("refuses a locked-out send before any send limit counts it, reading the lockout once", async () => {
    findPhoneVerificationMock.mockResolvedValue({ check_count: 5, expires_at: liveExpiry() });

    await expect(setPhone(KEEPER, "(617) 555-1212", "", limits)).rejects.toMatchObject({
      message: expect.stringContaining("too many incorrect codes"),
    });
    expect(findPhoneVerificationMock).toHaveBeenCalledTimes(1);
    expect(limits.beforeSend).not.toHaveBeenCalled();
    expect(beginPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("runs the send limits on the normalized number before the send is recorded", async () => {
    await setPhone(KEEPER, "(617) 555-1212", "", limits);

    expect(findPhoneVerificationMock).toHaveBeenCalledTimes(1);
    expect(limits.beforeSend).toHaveBeenCalledWith(PHONE);
    expect(limits.beforeSend.mock.invocationCallOrder[0]).toBeLessThan(
      beginPhoneVerificationMock.mock.invocationCallOrder[0],
    );
    expect(limits.beforeCheck).not.toHaveBeenCalled();
  });

  it("sends a code for a code of only spaces, under the send limits", async () => {
    await expect(setPhone(KEEPER, PHONE, "   ", limits)).resolves.toEqual({ verificationSent: true });
    expect(limits.beforeSend).toHaveBeenCalledWith(PHONE);
    expect(limits.beforeCheck).not.toHaveBeenCalled();
    expect(spendPhoneCheckAttemptMock).not.toHaveBeenCalled();
  });

  it("paces a code check before it costs an attempt, without the send limits", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    await setPhone(KEEPER, PHONE, CODE, limits);

    expect(limits.beforeCheck).toHaveBeenCalledTimes(1);
    expect(limits.beforeCheck.mock.invocationCallOrder[0]).toBeLessThan(
      spendPhoneCheckAttemptMock.mock.invocationCallOrder[0],
    );
    expect(limits.beforeSend).not.toHaveBeenCalled();
  });

  it("sends again while a verification is live with tries left", async () => {
    findPhoneVerificationMock.mockResolvedValue({ check_count: 4, expires_at: liveExpiry() });

    await expect(setPhone(KEEPER, PHONE, "", limits)).resolves.toEqual({ verificationSent: true });
    expect(startPhoneVerificationMock).toHaveBeenCalledWith(PHONE);
  });

  it("refuses a code of another length before it costs an attempt", async () => {
    await expect(setPhone(KEEPER, PHONE, "482913", limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "that code has 6 digits and ours have 8, use the code in our latest text",
    });
    expect(spendPhoneCheckAttemptMock).not.toHaveBeenCalled();
    expect(checkPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("refuses a code with anything but digits before it costs an attempt", async () => {
    await expect(setPhone(KEEPER, PHONE, "4829137a", limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "enter the code from our latest text",
    });
    expect(spendPhoneCheckAttemptMock).not.toHaveBeenCalled();
    // The only guard: the provider boundary trusts it and does not check again.
    expect(checkPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("says how many tries are left after a wrong code, and logs it without the code", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue(spentAttempt(2));
    checkPhoneVerificationMock.mockResolvedValue("rejected");

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "that code doesn't match the one we sent, 3 tries left",
    });
    expect(consumePhoneVerificationMock).not.toHaveBeenCalled();
    expect(logEventMock).toHaveBeenCalledWith("info", "phone verification code rejected", {
      verification: expect.stringMatching(/^[\w-]{8}$/),
      attempt: 2,
      secondsSinceFirstSend: 30,
      codeFingerprint: expect.stringMatching(/^[\w-]{8}$/),
    });
    expect(JSON.stringify(logEventMock.mock.calls)).not.toContain(CODE);
    expect(JSON.stringify(logEventMock.mock.calls)).not.toContain(PHONE);
  });

  it("names no number of tries when the provider's verification took checks elsewhere", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue(spentAttempt(1, false));
    checkPhoneVerificationMock.mockResolvedValue("rejected");

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "that code doesn't match the one we sent",
    });
  });

  it("fingerprints the same code alike and different codes apart within one verification", async () => {
    const attempt = spentAttempt(1);
    spendPhoneCheckAttemptMock.mockResolvedValue(attempt);
    checkPhoneVerificationMock.mockResolvedValue("rejected");

    await setPhone(KEEPER, PHONE, CODE, limits).catch(() => undefined);
    await setPhone(KEEPER, PHONE, CODE, limits).catch(() => undefined);
    await setPhone(KEEPER, PHONE, "11112222", limits).catch(() => undefined);

    const prints = logEventMock.mock.calls.map((call) => call[2].codeFingerprint);
    expect(prints[0]).toBe(prints[1]);
    expect(prints[2]).not.toBe(prints[0]);
  });

  it("locks out with the minutes left when the last try is wrong", async () => {
    spendPhoneCheckAttemptMock.mockResolvedValue(spentAttempt(5));
    checkPhoneVerificationMock.mockResolvedValue("rejected");

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      message: "too many incorrect codes, you can ask for a new one in 10 minutes",
    });
  });

  it("forgets its own verification when the provider no longer holds one", async () => {
    checkPhoneVerificationMock.mockResolvedValue("gone");

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "that code is no longer active, send a new one",
    });
    // So the next send starts afresh here too, rather than keeping a budget
    // and an expiry for a verification the provider does not have.
    // Only the verification that was checked: a newer one another session
    // started in the meantime keeps its code.
    expect(forgetPhoneVerificationMock).toHaveBeenCalledWith(KEEPER, PHONE, PROVIDER_SID);
    expect(consumePhoneVerificationMock).not.toHaveBeenCalled();
    expect(setUserPhoneMock).not.toHaveBeenCalled();
  });

  it("locks out when the provider reports its own check limit reached", async () => {
    checkPhoneVerificationMock.mockResolvedValue("exhausted");

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      message: expect.stringContaining("too many incorrect codes"),
    });
    expect(exhaustPhoneVerificationMock).toHaveBeenCalledWith(KEEPER, PHONE, PROVIDER_SID, 5);
    expect(setUserPhoneMock).not.toHaveBeenCalled();
  });

  it("consumes the verification on approval, making it single-use here", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    await setPhone(KEEPER, PHONE, CODE, limits);

    // By number: whichever Twilio id the row follows by now, this account's
    // verification of the number is done.
    expect(consumePhoneVerificationMock).toHaveBeenCalledWith(KEEPER, PHONE);
    expect(forgetPhoneVerificationMock).not.toHaveBeenCalled();
  });

  it("records nothing about the provider's verification when its answer names none", async () => {
    startPhoneVerificationMock.mockResolvedValue({ sid: null, createdAt: null });

    await expect(setPhone(KEEPER, PHONE, "", limits)).resolves.toEqual({ verificationSent: true });
    expect(recordProviderVerificationMock).not.toHaveBeenCalled();
  });

  it("records nothing when the send fails, leaving the row's provisional expiry", async () => {
    startPhoneVerificationMock.mockRejectedValue(
      Object.assign(new Error("phone verification is temporarily unavailable"), {
        code: "unavailable",
      }),
    );

    await expect(setPhone(KEEPER, PHONE, "", limits)).rejects.toThrow(/temporarily unavailable/);
    expect(beginPhoneVerificationMock).toHaveBeenCalled();
    expect(recordProviderVerificationMock).not.toHaveBeenCalled();
  });

  it("writes the number straight through when nothing holds it", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    const result = await setPhone(KEEPER, "(617) 555-1212", CODE, limits);

    expect(checkPhoneVerificationMock).toHaveBeenCalledWith(PHONE, CODE);
    expect(setUserPhoneMock).toHaveBeenCalledWith(KEEPER, PHONE);
    expect(result.user?.phone).toBe(PHONE);
  });

  it("resolves a concurrent unique race into a transfer (§34)", async () => {
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

    const result = await setPhone(KEEPER, PHONE, CODE, limits);

    expect(result.user).toBeDefined();
    expect(setUserPhoneMock).toHaveBeenCalledWith("someone-else", null, expect.anything());
    expect(setUserPhoneMock).toHaveBeenCalledWith(KEEPER, PHONE, expect.anything());
  });

  it("does not disguise unrelated database failures as phone conflicts", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);
    const databaseFailure = Object.assign(new Error("connection lost"), { code: "08006" });
    setUserPhoneMock.mockRejectedValueOnce(databaseFailure);

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toBe(databaseFailure);
    expect(findUserByPhone).toHaveBeenCalledTimes(1);
  });

  it("normalizes a national format before looking for a holder", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(undefined);

    await setPhone(KEEPER, "617-555-1212", CODE, limits);

    expect(findUserByPhone).toHaveBeenCalledWith(PHONE);
  });

  it("is a no-op re-save when the caller already holds the number", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(userRow({ phone: PHONE }));

    const result = await setPhone(KEEPER, PHONE, CODE, limits);

    expect(result.user).toBeDefined();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("transfers a number off the account holding it, telling both sides (§34)", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(
      userRow({ id: "someone-else", phone: PHONE, google_sub: "google-sub-2" }),
    );

    const result = await setPhone(KEEPER, PHONE, CODE, limits);

    expect(result.user).toBeDefined();
    expect(setUserPhoneMock).toHaveBeenCalledWith("someone-else", null, expect.anything());
    expect(setUserPhoneMock).toHaveBeenCalledWith(KEEPER, PHONE, expect.anything());
    const notified = vi.mocked(insertNotifications).mock.calls.map((call) => call[0]);
    expect(notified).toContainEqual(["someone-else"]);
    expect(notified).toContainEqual([KEEPER]);
  });

  it("refuses the transfer when the number is the holder's only identifier", async () => {
    // Clearing it would strand a phone-only (dev signup) account entirely.
    vi.mocked(findUserByPhone).mockResolvedValue(
      userRow({ id: "someone-else", phone: PHONE, email: null, google_sub: null, password_hash: "salt:hash" }),
    );

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "failed_precondition",
    });
    expect(setUserPhoneMock).not.toHaveBeenCalled();
  });

  it("starts over when the number moves again before the transfer locks", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(
      userRow({ id: "someone-else", phone: PHONE, google_sub: "google-sub-2" }),
    );
    vi.mocked(transferClient.query).mockResolvedValue({ rows: [] } as never);

    await expect(setPhone(KEEPER, PHONE, CODE, limits)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("changed while it was being claimed"),
    });
  });

  it("rejects an unparseable number before any lookup", async () => {
    await expect(setPhone(KEEPER, "not-a-number", CODE, limits)).rejects.toThrow(/valid phone number/);
    expect(findUserByPhone).not.toHaveBeenCalled();
  });
});
