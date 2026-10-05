/** Nonce replay, browser handoff and identity-binding regression tests. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as appleRepository from "../repo/appleSignIn.repo";
import * as provider from "./apple.provider";
import * as usersRepository from "../repo/users.repo";
import { appleProofHash, beginAppleSignIn, completeAppleSignIn, logInWithApple } from "./appleSignIn.usecase";

vi.mock("@/server/common/db", () => ({ transaction: async (work: (client: object) => unknown) => work({}) }));
vi.mock("../repo/appleSignIn.repo", () => ({ insertAppleChallenge: vi.fn(), consumeAppleNativeChallenge: vi.fn(),
  consumeAppleBrowserChallenge: vi.fn(), findAppleUser: vi.fn(), lockAppleIdentity: vi.fn(), saveAppleIdentity: vi.fn() }));
vi.mock("./apple.provider", () => ({ assertAppleSignInConfigured: vi.fn(), verifyAppleIdentity: vi.fn(), exchangeAppleCode: vi.fn(), encryptAppleToken: vi.fn() }));
vi.mock("../repo/users.repo", () => ({ findUserById: vi.fn(), insertUser: vi.fn() }));
vi.mock("./auth.usecase", () => ({ avatarColorFor: () => "#c73e2e", createToken: () => "local-session" }));

beforeEach(() => { vi.clearAllMocks(); });

describe("Apple challenge binding", () => {
  it("refuses a browser attempt without client proof", async () => {
    await expect(beginAppleSignIn({ browserFlow: true, mobile: false, verifierHash: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(appleRepository.insertAppleChallenge).not.toHaveBeenCalled();
  });
  it("stores a hashed native nonce and returns no browser redirect", async () => {
    const issued = await beginAppleSignIn({ browserFlow: false, mobile: true, verifierHash: "" });
    expect(issued.authorizationUrl).toBe("");
    expect(appleRepository.insertAppleChallenge).toHaveBeenCalledWith(expect.objectContaining({
      nonce_hash: appleProofHash(issued.nonce), client_id: "com.haalkhata.app", verifier_hash: null,
    }), 300);
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
});
