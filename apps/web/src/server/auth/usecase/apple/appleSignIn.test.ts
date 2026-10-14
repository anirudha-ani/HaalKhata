/** Nonce replay, browser handoff and identity-binding regression tests. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as appleRepository from "../../repo/apple/appleSignIn.repo";
import * as provider from "./apple.provider";
import * as usersRepository from "../../repo/users.repo";
import { appleProofHash, beginAppleSignIn, completeAppleSignIn, handleAppleCallback, logInWithApple } from "./appleSignIn.usecase";

vi.mock("@/server/common/db/db", () => ({ transaction: async (work: (client: object) => unknown) => work({}) }));
vi.mock("../../repo/apple/appleSignIn.repo", () => ({ insertAppleChallenge: vi.fn(), consumeAppleNativeChallenge: vi.fn(),
  consumeAppleBrowserChallenge: vi.fn(), findAppleUser: vi.fn(), lockAppleIdentity: vi.fn(), saveAppleIdentity: vi.fn(),
  findAppleBrowserChallenge: vi.fn(), finishAppleBrowserChallenge: vi.fn() }));
vi.mock("./apple.provider", () => ({ assertAppleSignInConfigured: vi.fn(), verifyAppleIdentity: vi.fn(), exchangeAppleCode: vi.fn(), encryptAppleToken: vi.fn() }));
vi.mock("../../repo/users.repo", () => ({ findUserById: vi.fn(), insertUser: vi.fn() }));
vi.mock("../account/auth.usecase", () => ({ avatarColorFor: () => "#c73e2e" }));
vi.mock("../session/session", () => ({ createToken: () => "local-session" }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("Apple challenge binding", () => {
  it("refuses a browser attempt without client proof", async () => {
    await expect(beginAppleSignIn({ browserFlow: true, mobile: false, verifierHash: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(appleRepository.insertAppleChallenge).not.toHaveBeenCalled();
  });
  it("stores a hashed native nonce and returns no browser redirect", async () => {
    vi.stubEnv("APPLE_SERVICE_ID", undefined);
    vi.stubEnv("APP_PUBLIC_URL", "http://localhost:3000");
    const issued = await beginAppleSignIn({ browserFlow: false, mobile: true, verifierHash: "" });
    expect(issued.authorizationUrl).toBe("");
    expect(provider.assertAppleSignInConfigured).toHaveBeenCalledWith("com.haalkhata.app");
    expect(appleRepository.insertAppleChallenge).toHaveBeenCalledWith(expect.objectContaining({
      nonce_hash: appleProofHash(issued.nonce), client_id: "com.haalkhata.app", verifier_hash: null,
    }), 300);
  });
  it("issues browser proof with the local HTTPS callback and Services ID", async () => {
    vi.stubEnv("APPLE_SERVICE_ID", "com.example.web");
    vi.stubEnv("APP_PUBLIC_URL", "https://dev.example.com");
    const issued = await beginAppleSignIn({ browserFlow: true, mobile: false, verifierHash: "a".repeat(64) });
    const authorization = new URL(issued.authorizationUrl);
    expect(authorization.origin).toBe("https://appleid.apple.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe("https://dev.example.com/api/auth/apple/callback");
    expect(authorization.searchParams.get("client_id")).toBe("com.example.web");
    expect(appleRepository.insertAppleChallenge).toHaveBeenCalledWith(expect.objectContaining({
      state_hash: appleProofHash(authorization.searchParams.get("state")!), verifier_hash: "a".repeat(64),
    }), 300);
  });
  it("rejects an invalid local browser origin before storing a challenge", async () => {
    vi.stubEnv("APPLE_SERVICE_ID", "com.example.web");
    vi.stubEnv("APP_PUBLIC_URL", "http://localhost:3000");
    await expect(beginAppleSignIn({ browserFlow: true, mobile: false, verifierHash: "a".repeat(64) }))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(appleRepository.insertAppleChallenge).not.toHaveBeenCalled();
  });
  it.each([false, true])("returns cancellation to the originating client, mobile=%s", async (mobile) => {
    vi.stubEnv("APP_PUBLIC_URL", "https://dev.example.com");
    vi.mocked(appleRepository.findAppleBrowserChallenge).mockResolvedValue({ state_hash: "state", nonce_hash: "nonce",
      client_id: "com.example.web", verifier_hash: "proof", mobile, user_id: null });
    const destination = new URL(await handleAppleCallback({ state: "s".repeat(43), code: "", name: "", cancelled: true }));
    expect(destination.href).toContain(mobile ? "haalkhata://login?" : "https://dev.example.com/login?");
    expect(destination.searchParams.get("apple_error")).toBe("cancelled");
    expect(provider.exchangeAppleCode).not.toHaveBeenCalled();
  });
  it("rejects an expired or replayed native challenge before account binding", async () => {
    vi.mocked(provider.verifyAppleIdentity).mockResolvedValue({ subject: "subject", email: "member@example.com", nonce: "n".repeat(43) });
    vi.mocked(provider.exchangeAppleCode).mockResolvedValue({ identityToken: "verified", refreshToken: "refresh" });
    vi.mocked(appleRepository.consumeAppleNativeChallenge).mockResolvedValue(undefined);
    await expect(logInWithApple({ idToken: "token", authorizationCode: "code", name: "Member" })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(appleRepository.saveAppleIdentity).not.toHaveBeenCalled();
  });
  it("rejects an authorization code for another Apple identity", async () => {
    vi.mocked(provider.verifyAppleIdentity)
      .mockResolvedValueOnce({ subject: "first", email: "member@example.com", nonce: "n".repeat(43) })
      .mockResolvedValueOnce({ subject: "second", email: "member@example.com", nonce: "n".repeat(43) });
    vi.mocked(provider.exchangeAppleCode).mockResolvedValue({ identityToken: "other", refreshToken: "refresh" });
    await expect(logInWithApple({ idToken: "token", authorizationCode: "code", name: "Member" })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(appleRepository.consumeAppleNativeChallenge).not.toHaveBeenCalled();
  });
  it("rejects a browser callback without the initiating client's secret verifier", async () => {
    vi.mocked(appleRepository.consumeAppleBrowserChallenge).mockResolvedValue(undefined);
    await expect(completeAppleSignIn({ state: "s".repeat(43), verifier: "v".repeat(43) })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(appleRepository.consumeAppleBrowserChallenge).toHaveBeenCalledWith(appleProofHash("s".repeat(43)), appleProofHash("v".repeat(43)));
    expect(usersRepository.findUserById).not.toHaveBeenCalled();
  });

  it("filters the caller-supplied Apple name before publishing it without rejecting valid proof", async () => {
    const nonce = "n".repeat(43);
    const member = { id: "member-id", email: "member@example.com", name: "Member", avatar_color: "#c73e2e",
      avatar_url: null, default_currency: "USD", password_hash: null, phone: null, phone_verified_at: null,
      google_sub: null, apple_sub: "subject", onboarded_at: null, merged_into: null, token_version: 0,
      created_at: "2026-10-05T00:00:00Z", payment_handles: [] };
    vi.mocked(provider.verifyAppleIdentity).mockResolvedValue({ subject: "subject", email: member.email, nonce });
    vi.mocked(provider.exchangeAppleCode).mockResolvedValue({ identityToken: "verified", refreshToken: "refresh" });
    vi.mocked(provider.encryptAppleToken).mockReturnValue("ciphertext");
    vi.mocked(appleRepository.consumeAppleNativeChallenge).mockResolvedValue({ state_hash: "state", nonce_hash: appleProofHash(nonce),
      client_id: "com.haalkhata.app", verifier_hash: null, mobile: true, user_id: null });
    vi.mocked(appleRepository.findAppleUser).mockResolvedValue(undefined);
    vi.mocked(usersRepository.insertUser).mockResolvedValue(member);
    vi.mocked(usersRepository.findUserById).mockResolvedValue(member);

    const result = await logInWithApple({ idToken: "valid-token", authorizationCode: "valid-code", name: "kill yourself" });

    expect(usersRepository.insertUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Member" }), expect.anything());
    expect(appleRepository.saveAppleIdentity).toHaveBeenCalledWith(member.id, "subject", "Member", "com.haalkhata.app", "ciphertext", expect.anything());
    expect(result.token).toBe("local-session");
  });
});
