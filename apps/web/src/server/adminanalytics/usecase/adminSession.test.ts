/** Unit tests for admin sessions: the allowlist, the separate credential, and that no account is ever touched. */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/auth.constants", () => ({
  GOOGLE_CLIENT_ID: "web-client.apps.googleusercontent.com",
}));
vi.mock("@/server/auth/usecase/auth.usecase", () => ({
  beginGoogleSignIn: vi.fn(),
  verifyGoogleSignIn: vi.fn(),
}));
vi.mock("@/server/adminanalytics/repo/adminSessions.repo", () => ({
  deleteAdminSession: vi.fn(),
  findAdminSession: vi.fn(),
  insertAdminSession: vi.fn(),
}));
vi.mock("@/server/common/logger", () => ({ logEvent: vi.fn() }));

import { beginGoogleSignIn, verifyGoogleSignIn } from "@/server/auth/usecase/auth.usecase";
import {
  deleteAdminSession,
  findAdminSession,
  insertAdminSession,
} from "@/server/adminanalytics/repo/adminSessions.repo";
import { logEvent } from "@/server/common/logger";
import {
  beginAdminSignIn,
  requireAdminSession,
  signInAdmin,
  signOutAdmin,
} from "./adminSession.usecase";

const OPERATOR = "operator@example.com";

/**
 * The digest the usecase stores for a token.
 *
 * @param token - Raw session token.
 * @returns Its SHA-256 hex digest.
 */
function digest(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Scripts the next Google verification to succeed for an address. */
function googleVerifies(email: string): void {
  vi.mocked(verifyGoogleSignIn).mockResolvedValue({
    googleSub: "google-sub",
    email,
    name: "Some Name",
    picture: "",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_EMAILS", OPERATOR);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("beginAdminSignIn", () => {
  it("issues the same kind of single-use nonce the app's sign-in does", async () => {
    vi.mocked(beginGoogleSignIn).mockResolvedValue({ nonce: "nonce-value" });

    await expect(beginAdminSignIn()).resolves.toEqual({ nonce: "nonce-value" });
  });
});

describe("signInAdmin", () => {
  it("starts a session for an allowlisted address and stores only the token's digest", async () => {
    googleVerifies(OPERATOR);

    const { token } = await signInAdmin("id-token");

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(insertAdminSession).toHaveBeenCalledExactlyOnceWith(digest(token), OPERATOR, 28800);
    expect(vi.mocked(insertAdminSession).mock.calls[0][0]).not.toContain(token);
  });

  it("accepts only a token minted for the web client, not for a mobile one", async () => {
    googleVerifies(OPERATOR);

    await signInAdmin("id-token");

    expect(verifyGoogleSignIn).toHaveBeenCalledWith("id-token", [
      "web-client.apps.googleusercontent.com",
    ]);
  });

  it("accepts only the admin page's own client when it has one, not the app's", async () => {
    vi.stubEnv("ADMIN_GOOGLE_CLIENT_ID", " admin-client.apps.googleusercontent.com ");
    googleVerifies(OPERATOR);

    await signInAdmin("id-token");

    expect(verifyGoogleSignIn).toHaveBeenCalledWith("id-token", [
      "admin-client.apps.googleusercontent.com",
    ]);
  });

  it("refuses a verified Google account that is not on the allowlist, and writes nothing", async () => {
    googleVerifies("stranger@example.com");

    await expect(signInAdmin("id-token")).rejects.toMatchObject({ code: "permission_denied" });
    expect(insertAdminSession).not.toHaveBeenCalled();
  });

  it("does not log a refused stranger's address", async () => {
    googleVerifies("stranger@example.com");

    await expect(signInAdmin("id-token")).rejects.toThrow();

    expect(JSON.stringify(vi.mocked(logEvent).mock.calls)).not.toContain("stranger@example.com");
  });

  it("refuses everyone when no allowlist is configured", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    googleVerifies(OPERATOR);

    await expect(signInAdmin("id-token")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("matches the allowlist without regard to case or stray spaces in the setting", async () => {
    vi.stubEnv("ADMIN_EMAILS", " Second@Example.com , OPERATOR@example.com ");
    googleVerifies(OPERATOR);

    await expect(signInAdmin("id-token")).resolves.toHaveProperty("token");
  });

  it("is not fooled by an address that only contains an allowlisted one", async () => {
    googleVerifies(`${OPERATOR}.evil.example`);
    await expect(signInAdmin("id-token")).rejects.toMatchObject({ code: "permission_denied" });

    googleVerifies(`not-${OPERATOR}`);
    await expect(signInAdmin("id-token")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("passes a failed Google verification straight through and starts nothing", async () => {
    vi.mocked(verifyGoogleSignIn).mockRejectedValue(
      Object.assign(new Error("could not verify that Google account"), { code: "unauthenticated" }),
    );

    await expect(signInAdmin("forged")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(insertAdminSession).not.toHaveBeenCalled();
  });

  it("gives every sign-in its own token", async () => {
    googleVerifies(OPERATOR);

    const first = await signInAdmin("id-token");
    const second = await signInAdmin("id-token");

    expect(first.token).not.toBe(second.token);
  });
});

describe("requireAdminSession", () => {
  const TOKEN = "A".repeat(43);

  it("accepts a live session whose address is still an admin", async () => {
    vi.mocked(findAdminSession).mockResolvedValue({ email: OPERATOR });

    await expect(requireAdminSession(TOKEN)).resolves.toBeUndefined();
    expect(findAdminSession).toHaveBeenCalledWith(digest(TOKEN));
  });

  it("refuses a request with no cookie without asking the database", async () => {
    await expect(requireAdminSession(null)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(findAdminSession).not.toHaveBeenCalled();
  });

  it("refuses anything that is not shaped like an admin token, including an app session token", async () => {
    // The app's own session format: version, user id, token version, expiry, signature.
    const appSessionToken = ["v2", "user-id", "0", "1900000000", "signature"].join(".");

    for (const candidate of ["", "short", appSessionToken, `${TOKEN}x`, `${TOKEN.slice(1)}=`]) {
      await expect(requireAdminSession(candidate)).rejects.toMatchObject({
        code: "unauthenticated",
      });
    }
    expect(findAdminSession).not.toHaveBeenCalled();
  });

  it("refuses an unknown, expired or signed-out session", async () => {
    vi.mocked(findAdminSession).mockResolvedValue(undefined);

    await expect(requireAdminSession(TOKEN)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("ends a session whose address has been taken off the allowlist", async () => {
    vi.mocked(findAdminSession).mockResolvedValue({ email: "former-admin@example.com" });

    await expect(requireAdminSession(TOKEN)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(deleteAdminSession).toHaveBeenCalledExactlyOnceWith(digest(TOKEN));
  });
});

describe("signOutAdmin", () => {
  it("deletes the session by its digest", async () => {
    const token = "B".repeat(43);

    await signOutAdmin(token);

    expect(deleteAdminSession).toHaveBeenCalledExactlyOnceWith(digest(token));
  });

  it("does nothing, and does not fail, without a usable token", async () => {
    await expect(signOutAdmin(null)).resolves.toBeUndefined();
    await expect(signOutAdmin("not-a-token")).resolves.toBeUndefined();
    expect(deleteAdminSession).not.toHaveBeenCalled();
  });
});
